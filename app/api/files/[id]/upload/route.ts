import { NextRequest, NextResponse } from "next/server";
import { verifyUploadToken } from "@/lib/server/crypto";
import { readDB, updateDB } from "@/lib/server/db";
import { MAX_UPLOAD_BYTES, writeStoredFile } from "@/lib/server/storage";

/**
 * Step 2 of an upload: receive the raw bytes. Authorised by the signed,
 * single-file token embedded in the URL from /files/presign, and only while
 * the reservation is still pending (so the URL can't be reused to overwrite).
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
  if (file.status !== "pending") {
    return NextResponse.json({ detail: "This file has already been uploaded." }, { status: 409 });
  }

  // The reservation's declared size is the ceiling (checked before buffering).
  const limit = Math.min(MAX_UPLOAD_BYTES, file.size);
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
  });

  return NextResponse.json({ message: "Upload successful.", fileId: id });
}
