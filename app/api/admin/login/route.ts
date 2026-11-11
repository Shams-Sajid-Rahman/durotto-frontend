import { NextRequest, NextResponse } from "next/server";
import { burnPasswordCheck, verifyPassword, signToken } from "@/lib/server/crypto";
import { genId, readDB, updateDB, publicUser } from "@/lib/server/db";
import { clientIp, rateLimit, readJson, str } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password.slice(0, 256) : "";

  const limited =
    rateLimit(`admin-login:ip:${clientIp(req)}`, 20, 10 * 60_000) ??
    rateLimit(`admin-login:email:${email}`, 5, 15 * 60_000);
  if (limited) return limited;

  const user = readDB().users.find((u) => u.email.toLowerCase() === email);
  let ok = false;
  if (user) ok = verifyPassword(password, user.passwordHash);
  else burnPasswordCheck(password);
  const isAdmin = !!(user && ok && user.role === "admin" && user.status === "active");

  updateDB((db) => {
    db.sessions.push({
      id: genId(),
      userId: user?.id ?? null,
      email: email ? `${email} (admin portal)` : "(admin portal)",
      ip: clientIp(req),
      userAgent: (req.headers.get("user-agent") ?? "unknown").slice(0, 300),
      success: isAdmin,
      at: new Date().toISOString(),
    });
  });

  if (!isAdmin || !user) {
    return NextResponse.json({ detail: "Invalid admin credentials." }, { status: 401 });
  }

  const token = signToken({ sub: user.id, role: "admin" });
  return NextResponse.json({
    access_token: token,
    token_type: "bearer",
    user: publicUser(user),
  });
}
