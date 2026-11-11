import { NextRequest, NextResponse } from "next/server";
import { burnPasswordCheck, verifyPassword, signToken } from "@/lib/server/crypto";
import { genId, readDB, updateDB, publicUser } from "@/lib/server/db";
import { clientIp, rateLimit, readJson, str } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password.slice(0, 256) : "";

  if (!email || !password) {
    return NextResponse.json({ detail: "Email and password are required." }, { status: 400 });
  }

  // Per-IP and per-account limits: the account limit still holds if a client
  // rotates IPs (or spoofs forwarding headers).
  const limited =
    rateLimit(`login:ip:${clientIp(req)}`, 30, 10 * 60_000) ??
    rateLimit(`login:email:${email}`, 10, 15 * 60_000);
  if (limited) return limited;

  const user = readDB().users.find((u) => u.email.toLowerCase() === email);
  let ok = false;
  if (user) ok = verifyPassword(password, user.passwordHash);
  else burnPasswordCheck(password);

  // Record every attempt (success or failure) in the login history.
  updateDB((db) => {
    db.sessions.push({
      id: genId(),
      userId: user?.id ?? null,
      email,
      ip: clientIp(req),
      userAgent: (req.headers.get("user-agent") ?? "unknown").slice(0, 300),
      success: !!(ok && user?.status === "active"),
      at: new Date().toISOString(),
    });
  });

  if (!user || !ok) {
    return NextResponse.json({ detail: "Invalid email or password." }, { status: 401 });
  }
  if (user.status === "suspended") {
    return NextResponse.json({ detail: "This account has been suspended." }, { status: 403 });
  }

  const token = signToken({ sub: user.id, role: user.role });
  return NextResponse.json({
    access_token: token,
    token_type: "bearer",
    user: publicUser(user),
  });
}
