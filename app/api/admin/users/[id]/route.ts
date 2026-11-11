import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/server/crypto";
import { updateDB, publicUser } from "@/lib/server/db";
import { requireAdmin, readJson, str } from "@/lib/server/auth";
import { deleteUserCascade } from "@/lib/server/users";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const body = await readJson(req);

  // An admin locking themselves out leaves nobody able to undo it.
  if (id === admin.id && (body.role === "user" || body.status === "suspended")) {
    return NextResponse.json(
      { detail: "You cannot demote or suspend the account you are signed in with." },
      { status: 400 },
    );
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8 || body.password.length > 128) {
      return NextResponse.json(
        { detail: "Password must be between 8 and 128 characters." },
        { status: 400 },
      );
    }
  }

  const result = updateDB((db) => {
    const u = db.users.find((x) => x.id === id);
    if (!u) return { error: "notfound" as const };

    const name = str(body.name, 100);
    if (name) u.name = name;
    const email = str(body.email, 254).toLowerCase();
    if (email) {
      if (!EMAIL_RE.test(email)) return { error: "bademail" as const };
      if (db.users.some((x) => x.id !== id && x.email.toLowerCase() === email)) {
        return { error: "duplicate" as const };
      }
      u.email = email;
    }
    if (typeof body.bio === "string") u.bio = body.bio.slice(0, 500);
    if (body.role === "admin" || body.role === "user") u.role = body.role;
    if (body.status === "active" || body.status === "suspended") u.status = body.status;
    if (typeof body.password === "string" && body.password.length >= 8) {
      u.passwordHash = hashPassword(body.password);
    }
    return { user: u };
  });

  if ("error" in result) {
    if (result.error === "notfound") {
      return NextResponse.json({ detail: "User not found." }, { status: 404 });
    }
    if (result.error === "bademail") {
      return NextResponse.json({ detail: "Enter a valid email address." }, { status: 400 });
    }
    return NextResponse.json({ detail: "That email is already in use." }, { status: 409 });
  }
  return NextResponse.json(publicUser(result.user));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json(
      { detail: "You cannot delete the account you are signed in with." },
      { status: 400 },
    );
  }

  const removed = updateDB((db) => deleteUserCascade(db, id));
  if (!removed) {
    return NextResponse.json({ detail: "User not found." }, { status: 404 });
  }
  return NextResponse.json({ message: "User deleted." });
}
