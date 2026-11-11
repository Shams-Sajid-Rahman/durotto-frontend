import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const db = readDB();
  const userById = new Map(db.users.map((u) => [u.id, u.name]));
  const history = [...db.sessions]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 200)
    .map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: s.userId ? userById.get(s.userId) ?? "(deleted user)" : null,
      email: s.email,
      ip: s.ip,
      userAgent: s.userAgent,
      success: s.success,
      at: s.at,
    }));

  return NextResponse.json(history);
}
