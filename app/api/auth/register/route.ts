import { NextRequest, NextResponse } from "next/server";
import { hashPassword, signToken } from "@/lib/server/crypto";
import { genId, updateDB, publicUser, pushNotification, type DbUser } from "@/lib/server/db";
import { clientIp, rateLimit, readJson, str } from "@/lib/server/auth";

const EMAIL_RE =/^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest) {
  const limited = rateLimit(`register:ip:${clientIp(req)}`, 10, 60 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const name = str(body.name, 100);
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return NextResponse.json({ detail: "Name, email and password are required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ detail: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { detail: "Password must be between 8 and 128 characters." },
      { status: 400 },
    );
  }

  const result = updateDB((db) => {
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      return { error: "An account with this email already exists." as const };
    }
    const user: DbUser = {
      id: genId(),
      name,
      email,
      passwordHash: hashPassword(password),
      role: "user",
      status: "active",
      settingsJson: "{}",
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    db.sessions.push({
      id: genId(),
      userId: user.id,
      email,
      ip: clientIp(req),
      userAgent: (req.headers.get("user-agent") ?? "unknown").slice(0, 300),
      success: true,
      at: new Date().toISOString(),
    });
    pushNotification(db, {
      userId: user.id,
      type: "system",
      title: "Welcome to Durotto!",
      body: "Your account is set up and ready to go. Start by creating a room.",
      payload: { targetUrl: "/meetings" },
    });
    return { user };
  });

  if ("error" in result) {
    return NextResponse.json({ detail: result.error }, { status: 409 });
  }

  const token = signToken({ sub: result.user.id, role: result.user.role });
  return NextResponse.json(
    { access_token: token, token_type: "bearer", user: publicUser(result.user) },
    { status: 201 },
  );
}
