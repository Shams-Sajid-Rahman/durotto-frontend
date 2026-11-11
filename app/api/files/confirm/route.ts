import { NextRequest, NextResponse } from "next/server";
import { isRoomMember, pushNotification, updateDB } from "@/lib/server/db";
import { getAuthUser, readJson, str, unauthorized } from "@/lib/server/auth";
import { fileView } from "@/lib/server/access";

/** Step 3 of an upload: finalise, optionally share into a room, notify members. */
export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const body = await readJson(req);
  const fileId = str(body.fileId, 64);
  const roomId = str(body.roomId, 64) || null;

  const result = updateDB((db) => {
    const file = db.files.find((f) => f.id === fileId && f.uploaderId === user.id);
    if (!file) return { error: 404 as const, detail: "File not found." };
    if (file.status !== "ready") {
      return { error: 409 as const, detail: "The upload has not completed yet." };
    }
    if (roomId && roomId !== file.roomId) {
      const room = db.rooms.find((r) => r.id === roomId);
      if (!room || !isRoomMember(room, user.id)) {
        return { error: 404 as const, detail: "Room not found." };
      }
      file.roomId = roomId;
    }

    if (file.roomId) {
      const room = db.rooms.find((r) => r.id === file.roomId);
      for (const memberId of room?.memberIds ?? []) {
        if (memberId === user.id) continue;
        pushNotification(db, {
          userId: memberId,
          type: "upload",
          title: "New file shared",
          body: `${user.name} shared ${file.name} in "${room?.name ?? "a room"}"`,
          payload: { roomId: file.roomId, fileId: file.id, targetUrl: "/files" },
        });
      }
    }
    return { view: fileView(db, file, user.id) };
  });

  if ("error" in result) {
    return NextResponse.json({ detail: result.detail }, { status: result.error });
  }
  return NextResponse.json(result.view);
}
