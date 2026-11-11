import { NextRequest, NextResponse } from "next/server";
import { signUploadToken } from "@/lib/server/crypto";
import { readJson, str } from "@/lib/server/auth";
import { requireFile } from "@/lib/server/access";
import { MAX_UPLOAD_BYTES, STORAGE_LIMIT_BYTES, normalizeMime } from "@/lib/server/storage";

/**
 * Start overwriting an existing file's contents (uploader only) — used to save
 * an edited whiteboard back to the file it was opened from. Returns a
 * short-lived upload URL; the file keeps its id, name and sharing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = requireFile(req, id, "own");
  if (!guard.ok) return guard.response;
  const { file, db, user } = guard.value;

  if (file.status !== "ready" || file.deletedAt) {
    return NextResponse.json({ detail: "This file can't be updated." }, { status: 409 });
  }

  const body = await readJson(req);
  const fileSize = typeof body.fileSize === "number" ? Math.floor(body.fileSize) : -1;
  const fileType = normalizeMime(str(body.fileType, 100));
  if (fileSize < 0) {
    return NextResponse.json({ detail: "fileSize is required." }, { status: 422 });
  }
  if (fileType !== file.mimeType) {
    return NextResponse.json(
      { detail: "The new contents must be the same file type." },
      { status: 415 },
    );
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ detail: "File is too large." }, { status: 413 });
  }
  const used = db.files
    .filter((f) => f.uploaderId === user.id && f.status === "ready")
    .reduce((sum, f) => sum + f.size, 0);
  if (used - file.size + fileSize > STORAGE_LIMIT_BYTES) {
    return NextResponse.json({ detail: "Storage quota exceeded." }, { status: 413 });
  }

  const base = req.nextUrl.pathname.replace(/\/replace\/?$/, "");
  const token = signUploadToken(file.id, user.id, { maxBytes: fileSize });
  return NextResponse.json({
    fileId: file.id,
    uploadUrl: `${base}/upload?token=${encodeURIComponent(token)}`,
  });
}
