import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/server/crypto";
import {
  genId,
  genJoinCode,
  isRoomMember,
  readDB,
  updateDB,
  type DbRoom,
} from "@/lib/server/db";
import { getAuthUser, rateLimit, readJson, str, unauthorized } from "@/lib/server/auth";
import { roomView } from "@/lib/server/access";

/** Rooms the caller hosts or has joined — never other people's rooms. */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  const rooms = readDB()
    .rooms.filter((r) => isRoomMember(r, user.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(roomView);
  return NextResponse.json(rooms);
}

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const limited = rateLimit(`create-room:${user.id}`, 30, 60 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const name = str(body.name, 100);
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) {
    return NextResponse.json({ detail: "Room name is required." }, { status: 422 });
  }
  if (password && (password.length < 4 || password.length > 64)) {
    return NextResponse.json(
      { detail: "Room password must be between 4 and 64 characters." },
      { status: 422 },
    );
  }

  const room = updateDB((db) => {
    let joinCode = genJoinCode();
    while (db.rooms.some((r) => r.joinCode === joinCode)) joinCode = genJoinCode();

    const newRoom: DbRoom = {
      id: genId(),
      name,
      joinCode,
      hostId: user.id,
      passwordHash: password ? hashPassword(password) : undefined,
      isPasswordProtected: !!password,
      memberIds: [user.id],
      createdAt: new Date().toISOString(),
    };
    db.rooms.push(newRoom);
    return newRoom;
  });

  return NextResponse.json(roomView(room), { status: 201 });
}
