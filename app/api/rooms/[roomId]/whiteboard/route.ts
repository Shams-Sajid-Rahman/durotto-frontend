import { NextRequest, NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/server/access";

/** Current whiteboard contents, so late joiners see what's already drawn. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const guard = requireRoomMember(req, roomId);
  if (!guard.ok) return guard.response;

  const strokes = guard.value.db.strokes
    .filter((s) => s.roomId === roomId)
    .map((s) => ({
      strokeId: s.strokeId,
      action: "add" as const,
      objectData: s.objectData,
      userId: s.userId,
      userName: s.userName,
      createdAt: s.createdAt,
    }));
  return NextResponse.json(strokes);
}
