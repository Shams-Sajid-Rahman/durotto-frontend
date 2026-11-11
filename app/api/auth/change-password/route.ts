import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/server/crypto";
import { updateDB } from "@/lib/server/db";
import { getAuthUser, rateLimit, readJson, unauthorized } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const limited = rateLimit(`change-password:${user.id}`, 10, 15 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return NextResponse.json({ detail: "Current password is incorrect." }, { status: 400 });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return NextResponse.json(
      { detail: "New password must be between 8 and 128 characters." },
      { status: 400 },
    );
  }

  updateDB((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (u) u.passwordHash = hashPassword(newPassword);
  });

  return NextResponse.json({ message: "Password updated successfully." });
}
