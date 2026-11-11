import { describe, expect, it } from "vitest";
import { GET as listRooms, POST as createRoomRoute } from "@/app/api/rooms/route";
import { GET as getRoom } from "@/app/api/rooms/[roomId]/route";
import { GET as getMessages } from "@/app/api/rooms/[roomId]/messages/route";
import { GET as getWhiteboard } from "@/app/api/rooms/[roomId]/whiteboard/route";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { PATCH as markRead } from "@/app/api/notifications/[id]/read/route";
import { createRoom, ctx, joinRoom, registerUser, req } from "../helpers";

describe("rooms", () => {
  it("creates a room with a join code; the host is a member", async () => {
    const host = await registerUser("Host");
    const room = await createRoom(host.token, "Design review");
    expect(room.join_code).toMatch(/^[A-Z0-9]{6}$/);

    const res = await getRoom(req("GET", `/api/rooms/${room.id}`, { token: host.token }), ctx({ roomId: room.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Design review");
    expect(body.participants[0].id).toBe(host.user.id);
  });

  it("validates the name and password", async () => {
    const host = await registerUser();
    const noName = await createRoomRoute(req("POST", "/api/rooms", { token: host.token, body: { name: "  " } }));
    expect(noName.status).toBe(422);
    const shortPw = await createRoomRoute(
      req("POST", "/api/rooms", { token: host.token, body: { name: "x", password: "abc" } }),
    );
    expect(shortPw.status).toBe(422);
  });

  it("lists only the caller's rooms (no leaking other people's join codes)", async () => {
    const alice = await registerUser("Alice");
    const bob = await registerUser("Bob");
    await createRoom(alice.token, "Alice's room");

    const bobRooms = await (await listRooms(req("GET", "/api/rooms", { token: bob.token }))).json();
    expect(bobRooms).toEqual([]);
    const aliceRooms = await (await listRooms(req("GET", "/api/rooms", { token: alice.token }))).json();
    expect(aliceRooms).toHaveLength(1);
  });

  it("hides rooms (and their history) from non-members", async () => {
    const alice = await registerUser("Alice");
    const mallory = await registerUser("Mallory");
    const room = await createRoom(alice.token, "Private", "s3cret");

    for (const handler of [getRoom, getMessages, getWhiteboard]) {
      const res = await handler(req("GET", `/api/rooms/${room.id}`, { token: mallory.token }), ctx({ roomId: room.id }));
      expect(res.status).toBe(404);
    }
  });
});

describe("POST /api/rooms/join-by-code", () => {
  it("joins an open room, grants access and notifies the host", async () => {
    const host = await registerUser("Host");
    const guest = await registerUser("Guest");
    const room = await createRoom(host.token);

    const res = await joinRoom(guest.token, room.join_code.toLowerCase());
    expect(res.status).toBe(200);
    expect((await res.json()).roomId).toBe(room.id);

    const access = await getRoom(req("GET", `/api/rooms/${room.id}`, { token: guest.token }), ctx({ roomId: room.id }));
    expect(access.status).toBe(200);
    const guestRooms = await (await listRooms(req("GET", "/api/rooms", { token: guest.token }))).json();
    expect(guestRooms.map((r: { id: string }) => r.id)).toEqual([room.id]);

    const notes = await (await listNotifications(req("GET", "/api/notifications", { token: host.token }))).json();
    const joinNote = notes.find((n: { type: string }) => n.type === "join");
    expect(joinNote.body).toContain("Guest");
    expect(joinNote.isRead).toBe(false);

    const read = await markRead(req("PATCH", "/x", { token: host.token }), ctx({ id: joinNote.id }));
    expect(read.status).toBe(200);
    // someone else's notification id behaves as missing
    const foreign = await markRead(req("PATCH", "/x", { token: guest.token }), ctx({ id: joinNote.id }));
    expect(foreign.status).toBe(404);
  });

  it("requires the room password without revealing the room", async () => {
    const host = await registerUser();
    const guest = await registerUser();
    const room = await createRoom(host.token, "Locked", "s3cret");

    const ask = await (await joinRoom(guest.token, room.join_code)).json();
    expect(ask).toEqual({ requiresPassword: true, roomId: null, joinCode: room.join_code });

    expect((await joinRoom(guest.token, room.join_code, "wrong")).status).toBe(403);
    const ok = await joinRoom(guest.token, room.join_code, "s3cret");
    expect((await ok.json()).roomId).toBe(room.id);
  });

  it("rejects malformed and unknown codes, and throttles guessing", async () => {
    const guest = await registerUser();
    expect((await joinRoom(guest.token, "abc")).status).toBe(422);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await joinRoom(guest.token, "ZZZZZZ")).status);
    expect(statuses[0]).toBe(404);
    expect(statuses.at(-1)).toBe(429);
  });
});
