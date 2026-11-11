import { NextRequest, NextResponse } from "next/server";
import { readDB, publicUser } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

// Raw-ish view of every table for the admin "Database" tab. Password hashes are
// stripped from the users table before it leaves the server.
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const db = readDB();
  return NextResponse.json({
    users: db.users.map(publicUser),
    rooms: db.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      joinCode: r.joinCode,
      hostId: r.hostId,
      isPasswordProtected: r.isPasswordProtected,
      createdAt: r.createdAt,
    })),
    sessions: db.sessions,
    calls: db.calls,
    notifications: db.notifications,
    counts: {
      users: db.users.length,
      rooms: db.rooms.length,
      sessions: db.sessions.length,
      calls: db.calls.length,
      notifications: db.notifications.length,
      files: db.files.length,
      messages: db.messages.length,
      whiteboardStrokes: db.strokes.length,
    },
  });
}
