import { NextRequest, NextResponse } from "next/server";
import { isRoomMember, publicUser, readDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";

/** Download a JSON copy of everything stored about the caller. */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const db = readDB();
  let settings: unknown = {};
  try {
    settings = JSON.parse(user.settingsJson || "{}");
  } catch {
    // keep {}
  }

  const data = {
    exportedAt: new Date().toISOString(),
    profile: publicUser(user),
    settings,
    rooms: db.rooms
      .filter((r) => isRoomMember(r, user.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        isHost: r.hostId === user.id,
        joinCode: r.hostId === user.id ? r.joinCode : undefined,
        createdAt: r.createdAt,
      })),
    files: db.files
      .filter((f) => f.uploaderId === user.id && f.status === "ready")
      .map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        roomId: f.roomId,
        deletedAt: f.deletedAt,
        createdAt: f.createdAt,
      })),
    messages: db.messages
      .filter((m) => m.senderId === user.id)
      .map((m) => ({ id: m.id, roomId: m.roomId, payload: m.payload, sentAt: m.sentAt })),
    notifications: db.notifications.filter((n) => n.userId === user.id),
    signIns: db.sessions
      .filter((s) => s.userId === user.id)
      .map((s) => ({ at: s.at, success: s.success, ip: s.ip, userAgent: s.userAgent })),
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="durotto-export.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
