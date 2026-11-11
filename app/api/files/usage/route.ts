import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";
import { STORAGE_LIMIT_BYTES } from "@/lib/server/storage";

/** Bytes stored by the caller (Trash counts until it is emptied). */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  const totalBytes = readDB()
    .files.filter((f) => f.uploaderId === user.id && f.status === "ready")
    .reduce((sum, f) => sum + f.size, 0);
  const gb = 1024 ** 3;
  return NextResponse.json({
    totalBytes,
    totalGb: Math.round((totalBytes / gb) * 10_000) / 10_000,
    limitGb: STORAGE_LIMIT_BYTES / gb,
    limitBytes: STORAGE_LIMIT_BYTES,
  });
}
