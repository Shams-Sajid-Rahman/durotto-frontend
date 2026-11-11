import { NextRequest, NextResponse } from "next/server";
import { verifyUploadToken } from "@/lib/server/crypto";
import { readDB, updateDB } from "@/lib/server/db";
import { MAX_UPLOAD_BYTES, writeStoredFile } from "@/lib/server/storage";

/**
 * Receive a file's raw bytes. Authorised by the signed, single-file token in
 * the URL from /files/presign (new upload: only while the reservation is
 * pending, so it can't be reused to overwrite) or /files/{id}/replace
 * (owner overwriting an existing file, e.g. re-saving an edited whiteboard).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const grant = verifyUploadToken(req.nextUrl.searchParams.get("token"), id);
  if (!grant) {
    return NextResponse.json({ detail: "Upload link is invalid or has expired." }, { status: 403 });
  }

  const file = readDB().files.find((f) => f.id === id);
  if (!file || file.uploaderId !== grant.sub) {
    return NextResponse.json({ detail: "File not found." }, { status: 404 });
  }

  const replacing = grant.replaceMaxBytes !== undefined;
  if (replacing) {
    if (file.status !== "ready" || file.deletedAt) {
      return NextResponse.json({ detail: "This file can't be updated." }, { status: 409 });
    }
  } else if (file.status !== "pending") {
    return NextResponse.json({ detail: "This file has already been uploaded." }, { status: 409 });
  }

  // The declared size is the ceiling (checked before buffering).
  const limit = Math.min(MAX_UPLOAD_BYTES, replacing ? grant.replaceMaxBytes! : file.size);
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > limit) {
    return NextResponse.json({ detail: "File is larger than declared." }, { status: 413 });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > limit) {
    return NextResponse.json({ detail: "File is larger than declared." }, { status: 413 });
  }

  writeStoredFile(id, bytes);
  updateDB((db) => {
    const f = db.files.find((x) => x.id === id);
    if (!f) return;
    f.size = bytes.byteLength;
    f.status = "ready";
    if (replacing) f.updatedAt = new Date().toISOString();
  });

  return NextResponse.json({ message: "Upload successful.", fileId: id });
}
