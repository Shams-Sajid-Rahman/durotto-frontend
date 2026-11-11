import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const db = readDB();
  const successfulLogins = db.sessions.filter((s) => s.success).length;
  return NextResponse.json({
    users: db.users.length,
    admins: db.users.filter((u) => u.role === "admin").length,
    rooms: db.rooms.length,
    calls: db.calls.length,
    loginAttempts: db.sessions.length,
    successfulLogins,
    failedLogins: db.sessions.length - successfulLogins,
  });
}
