import { NextRequest, NextResponse } from "next/server";
import { isRoomMember, readDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const db = readDB();
  const memberRoomIds = new Set(
    db.rooms.filter((r) => isRoomMember(r, user.id)).map((r) => r.id),
  );
  // Calls that happened in rooms the user belongs to.
  const myCalls = db.calls.filter((c) => memberRoomIds.has(c.roomId));
  const hoursOnline = Math.round(
    myCalls.reduce((sum, c) => sum + c.durationSec, 0) / 3600,
  );

  return NextResponse.json({
    meetingsAttended: myCalls.length,
    hoursOnline,
    filesShared: db.files.filter(
      (f) => f.uploaderId === user.id && f.status === "ready" && !f.deletedAt,
    ).length,
    roomsCreated: db.rooms.filter((r) => r.hostId === user.id).length,
  });
}
