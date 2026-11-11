import { describe, expect, it } from "vitest";
import { GET as openStream, POST as send } from "@/app/api/rooms/[roomId]/signal/route";
import { GET as getMessages } from "@/app/api/rooms/[roomId]/messages/route";
import { GET as getWhiteboard } from "@/app/api/rooms/[roomId]/whiteboard/route";
import { GET as online } from "@/app/api/users/online/route";
import { readDB } from "@/lib/server/db";
import { connectedPeers } from "@/lib/server/signaling-hub";
import { parseSseChunk, signalingMode } from "@/lib/webrtc/signaling";
import { createRoom, ctx, joinRoom, registerUser, req } from "../helpers";

interface Event {
  type: string;
  senderId?: string;
  senderName?: string;
  targetUserId?: string;
  payload?: unknown;
}

/** Open the SSE stream for a user and expose a "next event" reader. */
async function connect(token: string, roomId: string) {
  const abort = new AbortController();
  const res = await openStream(
    req("GET", `/api/rooms/${roomId}/signal`, { token, signal: abort.signal }),
    ctx({ roomId }),
  );
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const queue: Event[] = [];
  let buffer = "";

  async function next(timeoutMs = 2000): Promise<Event> {
    const deadline = Date.now() + timeoutMs;
    while (queue.length === 0) {
      if (!reader) throw new Error(`no stream (status ${res.status})`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("timed out waiting for event");
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), remaining)),
      ]);
      if (chunk.done) throw new Error("stream ended");
      buffer = parseSseChunk(buffer + decoder.decode(chunk.value, { stream: true }), (data) =>
        queue.push(JSON.parse(data)),
      );
    }
    return queue.shift()!;
  }

  return { res, next, close: () => abort.abort() };
}

async function post(token: string, roomId: string, message: unknown) {
  return send(req("POST", `/api/rooms/${roomId}/signal`, { token, body: message }), ctx({ roomId }));
}

async function setup() {
  const alice = await registerUser("Alice");
  const bob = await registerUser("Bob");
  const room = await createRoom(alice.token, "Call");
  await joinRoom(bob.token, room.join_code);
  return { alice, bob, room };
}

describe("signaling stream", () => {
  it("streams presence and relays targeted messages with server-stamped identity", async () => {
    const { alice, bob, room } = await setup();

    const a = await connect(alice.token, room.id);
    expect(a.res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(a.res.headers.get("cache-control")).toContain("no-transform");
    expect(await a.next()).toMatchObject({ type: "welcome", payload: { peers: [] } });

    const b = await connect(bob.token, room.id);
    expect(await b.next()).toMatchObject({
      type: "welcome",
      payload: { peers: [{ id: alice.user.id, name: "Alice" }] },
    });
    expect(await a.next()).toMatchObject({ type: "peer-joined", senderId: bob.user.id, senderName: "Bob" });

    // Bob → Alice offer; a client-supplied senderId must be overwritten.
    const res = await post(bob.token, room.id, {
      type: "offer",
      targetUserId: alice.user.id,
      senderId: alice.user.id,
      payload: { type: "offer", sdp: "v=0" },
    });
    expect(await res.json()).toEqual({ delivered: 1 });
    expect(await a.next()).toMatchObject({
      type: "offer",
      senderId: bob.user.id,
      senderName: "Bob",
      payload: { sdp: "v=0" },
    });

    expect(connectedPeers(room.id).map((p) => p.id).sort()).toEqual([alice.user.id, bob.user.id].sort());
    const onlineForAlice = await (await online(req("GET", "/api/users/online", { token: alice.token }))).json();
    expect(onlineForAlice).toEqual([{ id: bob.user.id, name: "Bob", roomId: room.id, roomName: "Call" }]);

    b.close();
    expect(await a.next()).toMatchObject({ type: "peer-left", senderId: bob.user.id });
    a.close();
  });

  it("persists chat and whiteboard events for late joiners", async () => {
    const { alice, bob, room } = await setup();
    const a = await connect(alice.token, room.id);
    await a.next();

    await post(alice.token, room.id, { type: "chat-message", payload: { text: "hi all" } });
    await post(alice.token, room.id, { type: "draw", payload: { strokeId: "s1", action: "add", objectData: { type: "Rect" } } });
    await post(alice.token, room.id, { type: "draw", payload: { strokeId: "s2", action: "add", objectData: { type: "Circle" } } });
    await post(alice.token, room.id, { type: "draw", payload: { strokeId: "s2", action: "update", objectData: { type: "Circle", left: 5 } } });
    await post(alice.token, room.id, { type: "draw", payload: { strokeId: "s1", action: "remove" } });

    const messages = await (await getMessages(req("GET", "/x", { token: bob.token }), ctx({ roomId: room.id }))).json();
    expect(messages).toMatchObject([{ senderId: alice.user.id, senderName: "Alice", payload: { text: "hi all" } }]);

    const strokes = await (await getWhiteboard(req("GET", "/x", { token: bob.token }), ctx({ roomId: room.id }))).json();
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toMatchObject({ strokeId: "s2", objectData: { left: 5 } });
    a.close();
  });

  it("records a call with duration and participant count", async () => {
    const { alice, bob, room } = await setup();
    const a = await connect(alice.token, room.id);
    await a.next();
    const b = await connect(bob.token, room.id);
    await b.next();

    const live = readDB().calls.find((c) => c.roomId === room.id);
    expect(live).toMatchObject({ endedAt: null, participantCount: 2 });

    a.close();
    b.close();
    await new Promise((r) => setTimeout(r, 20));
    const ended = readDB().calls.find((c) => c.roomId === room.id);
    expect(ended?.endedAt).toBeTruthy();
  });

  it("rejects non-members and unknown message types", async () => {
    const { alice, room } = await setup();
    const outsider = await registerUser("Eve");

    const stream = await openStream(req("GET", "/x", { token: outsider.token }), ctx({ roomId: room.id }));
    expect(stream.status).toBe(404);
    expect((await post(outsider.token, room.id, { type: "offer" })).status).toBe(404);
    expect((await post(alice.token, room.id, { type: "peer-left" })).status).toBe(422);
    expect((await post(alice.token, room.id, { type: "chat-message", payload: "x".repeat(600_000) })).status).toBe(413);
  });
});

describe("signaling client helpers", () => {
  it("parses SSE frames across chunk boundaries", () => {
    const seen: string[] = [];
    let rest = parseSseChunk("retry: 2000\n\ndata: {\"a\":1}\n\n: ping\n\ndata: {\"b\"", (d) => seen.push(d));
    expect(seen).toEqual(['{"a":1}']);
    rest = parseSseChunk(`${rest}:2}\r\n\r\n`, (d) => seen.push(d));
    expect(seen).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe("");
  });

  it("picks the transport from the API base", () => {
    expect(signalingMode("/api")).toBe("http");
    expect(signalingMode("http://localhost:8000")).toBe("websocket");
  });
});
