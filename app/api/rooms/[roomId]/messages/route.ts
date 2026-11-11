import { NextRequest, NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/server/access";

/** Chat history for the room (messages are persisted by the signaling relay). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const guard = requireRoomMember(req, roomId);
  if (!guard.ok) return guard.response;

  const messages = guard.value.db.messages
    .filter((m) => m.roomId === roomId)
    .map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName,
      payload: m.payload,
      sentAt: m.sentAt,
    }));
  return NextResponse.json(messages);
}
