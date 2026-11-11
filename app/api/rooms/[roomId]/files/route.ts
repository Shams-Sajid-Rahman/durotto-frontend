import { NextRequest, NextResponse } from "next/server";
import { fileView, requireRoomMember } from "@/lib/server/access";

/** Files shared into this room (newest first). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const guard = requireRoomMember(req, roomId);
  if (!guard.ok) return guard.response;
  const { db, user } = guard.value;

  const files = db.files
    .filter((f) => f.roomId === roomId && f.status === "ready" && !f.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((f) => fileView(db, f, user.id));
  return NextResponse.json(files);
}
