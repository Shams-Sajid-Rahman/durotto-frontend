import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/server/crypto";
import { updateDB, type DbUser } from "@/lib/server/db";
import { getAuthUser, rateLimit, readJson, str, unauthorized } from "@/lib/server/auth";
import { deleteUserCascade } from "@/lib/server/users";

// Avatars arrive as a data URL from the profile editor (or an http(s) link).
const MAX_AVATAR_DATA_URL = 1_500_000; // ~1.1 MB image
const DATA_URL_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const HTTP_URL_RE = /^https?:\/\/[^\s"'<>]+$/;

function profile(u: DbUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    bio: u.bio ?? "",
    avatarUrl: u.avatarUrl ?? null,
  };
}

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(profile(user));
}

export async function PATCH(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const body = await readJson(req);
  let avatarUrl: string | undefined | null; // undefined = unchanged, null = remove
  if (typeof body.avatarUrl === "string") {
    const value = body.avatarUrl.trim();
    if (value === "") avatarUrl = null;
    else if (
      (DATA_URL_RE.test(value) && value.length <= MAX_AVATAR_DATA_URL) ||
      (HTTP_URL_RE.test(value) && value.length <= 500)
    ) {
      avatarUrl = value;
    } else {
      return NextResponse.json(
        { detail: "Avatar must be a PNG, JPEG, GIF or WebP image under 1 MB." },
        { status: 422 },
      );
    }
  }

  const updated = updateDB((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) return null;
    const name = str(body.name, 100);
    if (name) u.name = name;
    if (typeof body.bio === "string") u.bio = body.bio.slice(0, 500);
    if (avatarUrl === null) delete u.avatarUrl;
    else if (avatarUrl !== undefined) u.avatarUrl = avatarUrl;
    return u;
  });

  if (!updated) return unauthorized();
  return NextResponse.json(profile(updated));
}

/** Delete your own account. Requires the current password. */
export async function DELETE(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const limited = rateLimit(`delete-account:${user.id}`, 5, 15 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ detail: "Password is incorrect." }, { status: 400 });
  }
  if (user.role === "admin") {
    return NextResponse.json(
      { detail: "Admin accounts must be removed by another admin." },
      { status: 400 },
    );
  }

  updateDB((db) => deleteUserCascade(db, user.id));
  return NextResponse.json({ message: "Your account has been deleted." });
}
