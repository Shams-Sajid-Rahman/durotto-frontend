import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const db = readDB();
  const userById = new Map(db.users.map((u) => [u.id, u.name]));
  const calls = [...db.calls]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((c) => ({
      id: c.id,
      roomId: c.roomId,
      roomName: c.roomName,
      hostName: userById.get(c.hostId) ?? "(deleted user)",
      participantCount: c.participantCount,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      durationSec: c.durationSec,
    }));

  return NextResponse.json(calls);
}
