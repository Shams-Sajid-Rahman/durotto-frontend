import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";

/** The caller's recent sign-in attempts (for the Settings → Devices panel). */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const history = readDB()
    .sessions.filter((s) => s.userId === user.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20)
    .map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      success: s.success,
      at: s.at,
    }));
  return NextResponse.json(history);
}
