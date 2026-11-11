import { NextRequest, NextResponse } from "next/server";
import { isRoomMember, readDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";
import { fileView } from "@/lib/server/access";

/**
 * The caller's library: everything they uploaded (including items in Trash,
 * which the UI filters by `deletedAt`) plus files others shared into rooms the
 * caller belongs to.
 */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const db = readDB();
  const memberRoomIds = new Set(
    db.rooms.filter((r) => isRoomMember(r, user.id)).map((r) => r.id),
  );
  const files = db.files
    .filter((f) => f.status === "ready")
    .filter(
      (f) =>
        f.uploaderId === user.id ||
        (!f.deletedAt && f.roomId !== null && memberRoomIds.has(f.roomId)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((f) => fileView(db, f, user.id));

  return NextResponse.json(files);
}
