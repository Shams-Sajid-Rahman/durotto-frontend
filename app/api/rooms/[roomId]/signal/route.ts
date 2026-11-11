import { NextRequest, NextResponse } from "next/server";
import { genId } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/auth";
import { requireRoomMember } from "@/lib/server/access";
import {
  CLIENT_MESSAGE_TYPES,
  MAX_MESSAGE_BYTES,
  joinRoom,
  leaveRoom,
  persistRoomEvent,
  relay,
  type OutboundMessage,
} from "@/lib/server/signaling-hub";

const HEARTBEAT_MS = 15_000;

/**
 * Server → client half of the signaling channel: a Server-Sent Events stream.
 * The client reads it with fetch() so the bearer token travels in the
 * Authorization header rather than the URL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const guard = requireRoomMember(req, roomId);
  if (!guard.ok) return guard.response;
  const { user } = guard.value;

  const encoder = new TextEncoder();
  const connectionId = genId();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        leaveRoom(roomId, connectionId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      // Tell the browser how long to wait before EventSource-style reconnects.
      write("retry: 2000\n\n");
      joinRoom(roomId, {
        connectionId,
        userId: user.id,
        userName: user.name,
        send: (message: OutboundMessage) => write(`data: ${JSON.stringify(message)}\n\n`),
        close: cleanup,
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      leaveRoom(roomId, connectionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops compression middleware from buffering the stream
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Client → server half: relay one message to the room (or a single peer). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const guard = requireRoomMember(req, roomId);
  if (!guard.ok) return guard.response;
  const { user } = guard.value;

  // Generous: ICE trickle and whiteboard cursors are chatty.
  const limited = rateLimit(`signal:${user.id}`, 1200, 60_000);
  if (limited) return limited;

  const raw = await req.text();
  if (raw.length > MAX_MESSAGE_BYTES) {
    return NextResponse.json({ detail: "Message too large." }, { status: 413 });
  }
  let message: { type?: unknown; targetUserId?: unknown; payload?: unknown };
  try {
    message = JSON.parse(raw);
  } catch {
    return NextResponse.json({ detail: "Invalid JSON." }, { status: 400 });
  }
  if (!message || typeof message.type !== "string" || !CLIENT_MESSAGE_TYPES.has(message.type)) {
    return NextResponse.json({ detail: "Unsupported message type." }, { status: 422 });
  }

  const sender = { id: user.id, name: user.name };
  const clean = {
    type: message.type,
    targetUserId: typeof message.targetUserId === "string" ? message.targetUserId : undefined,
    payload: message.payload,
  };
  const delivered = relay(roomId, sender, clean);
  if (!clean.targetUserId) persistRoomEvent(roomId, sender, clean);

  return NextResponse.json({ delivered });
}
