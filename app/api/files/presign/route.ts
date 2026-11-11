import { NextRequest, NextResponse } from "next/server";
import { signUploadToken } from "@/lib/server/crypto";
import { genId, isRoomMember, updateDB } from "@/lib/server/db";
import { getAuthUser, rateLimit, readJson, str, unauthorized } from "@/lib/server/auth";
import {
  MAX_UPLOAD_BYTES,
  STORAGE_LIMIT_BYTES,
  isAllowedMime,
  normalizeMime,
  sanitizeFileName,
} from "@/lib/server/storage";

const PENDING_TTL_MS = 60 * 60 * 1000;

/**
 * Step 1 of an upload: reserve a file id and hand back a short-lived upload URL
 * (the browser then PUTs the bytes there, then calls /files/confirm).
 */
export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const limited = rateLimit(`presign:${user.id}`, 60, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const fileName = sanitizeFileName(str(body.fileName, 255));
  const fileType = normalizeMime(str(body.fileType, 100));
  const fileSize = typeof body.fileSize === "number" ? Math.floor(body.fileSize) : -1;
  const roomId = str(body.roomId, 64) || null;

  if (fileSize < 0) {
    return NextResponse.json({ detail: "fileSize is required." }, { status: 422 });
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    return NextResponse.json({ detail: `Files must be ${mb} MB or smaller.` }, { status: 413 });
  }
  if (!isAllowedMime(fileType)) {
    return NextResponse.json(
      { detail: `File type "${fileType}" is not allowed.` },
      { status: 415 },
    );
  }

  const result = updateDB((db) => {
    if (roomId) {
      const room = db.rooms.find((r) => r.id === roomId);
      if (!room || !isRoomMember(room, user.id)) return { error: "room" as const };
    }
    const used = db.files
      .filter((f) => f.uploaderId === user.id && f.status === "ready")
      .reduce((sum, f) => sum + f.size, 0);
    if (used + fileSize > STORAGE_LIMIT_BYTES) return { error: "quota" as const };

    // Drop reservations that were never uploaded.
    const cutoff = Date.now() - PENDING_TTL_MS;
    db.files = db.files.filter(
      (f) => f.status !== "pending" || new Date(f.createdAt).getTime() > cutoff,
    );

    const id = genId();
    db.files.push({
      id,
      name: fileName,
      size: fileSize,
      mimeType: fileType,
      uploaderId: user.id,
      roomId,
      status: "pending",
      favoriteBy: [],
      deletedAt: null,
      createdAt: new Date().toISOString(),
    });
    return { id };
  });

  if ("error" in result) {
    return result.error === "room"
      ? NextResponse.json({ detail: "Room not found." }, { status: 404 })
      : NextResponse.json({ detail: "Storage quota exceeded." }, { status: 413 });
  }

  // Same prefix the client used to reach us (e.g. /api/files/presign).
  const base = req.nextUrl.pathname.replace(/\/presign\/?$/, "");
  const token = signUploadToken(result.id, user.id);
  return NextResponse.json(
    {
      fileId: result.id,
      uploadUrl: `${base}/${result.id}/upload?token=${encodeURIComponent(token)}`,
    },
    { status: 201 },
  );
}
