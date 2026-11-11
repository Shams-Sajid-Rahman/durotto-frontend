import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/server/crypto";
import { isRoomMember, pushNotification, readDB, updateDB } from "@/lib/server/db";
import { clientIp, getAuthUser, rateLimit, readJson, unauthorized } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  // Join codes and room passwords are guessable secrets — throttle attempts.
  const limited =
    rateLimit(`join:user:${user.id}`, 10, 60_000) ??
    rateLimit(`join:ip:${clientIp(req)}`, 30, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const code = (typeof body.code === "string" ? body.code : "").toUpperCase().trim();
  const password = typeof body.password === "string" ? body.password : undefined;

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ detail: "Invalid or expired meeting code." }, { status: 422 });
  }

  const room = readDB().rooms.find((r) => r.joinCode === code);
  if (!room) {
    return NextResponse.json({ detail: "Invalid or expired meeting code." }, { status: 404 });
  }

  const alreadyMember = isRoomMember(room, user.id);
  if (room.isPasswordProtected && !alreadyMember) {
    if (!password) {
      // Don't leak room details before the password is provided.
      return NextResponse.json({ requiresPassword: true, roomId: null, joinCode: code });
    }
    if (!room.passwordHash || !verifyPassword(password, room.passwordHash)) {
      return NextResponse.json({ detail: "Incorrect password." }, { status: 403 });
    }
  }

  if (!alreadyMember) {
    updateDB((db) => {
      const r = db.rooms.find((x) => x.id === room.id);
      if (!r || r.memberIds.includes(user.id)) return;
      r.memberIds.push(user.id);
      if (r.hostId !== user.id) {
        pushNotification(db, {
          userId: r.hostId,
          type: "join",
          title: `${user.name} joined your room`,
          body: `${user.name} joined "${r.name}"`,
          payload: { roomId: r.id, targetUrl: `/room/${r.id}` },
        });
      }
    });
  }

  return NextResponse.json({ roomId: room.id, joinCode: code });
}
