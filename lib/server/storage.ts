import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { uploadsDir } from "@/lib/server/db";

/** Max size of a single upload (bytes). */
export const MAX_UPLOAD_BYTES = Number(process.env.DUROTTO_MAX_UPLOAD_BYTES) || 100 * 1024 * 1024;

/** Per-user storage quota (bytes). */
export const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

// Ids are generated server-side as 32 hex chars; anything else is rejected so
// a crafted id can never escape the uploads directory.
const SAFE_ID = /^[a-f0-9]{32}$/;

export function storedFilePath(fileId: string): string {
  if (!SAFE_ID.test(fileId)) throw new Error("Invalid file id");
  return join(uploadsDir(), fileId);
}

export function writeStoredFile(fileId: string, data: Uint8Array): void {
  mkdirSync(uploadsDir(), { recursive: true });
  writeFileSync(storedFilePath(fileId), data);
}

export function removeStoredFile(fileId: string): void {
  if (!SAFE_ID.test(fileId)) return;
  const path = storedFilePath(fileId);
  if (existsSync(path)) rmSync(path, { force: true });
}

/** MIME types accepted for upload. Executables/HTML are refused. */
const ALLOWED_PREFIXES = ["image/", "video/", "audio/", "text/plain", "text/csv", "text/markdown"];
const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

export function normalizeMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase() || "application/octet-stream";
}

export function isAllowedMime(mime: string): boolean {
  const m = normalizeMime(mime);
  if (m === "image/svg+xml") return false; // SVG can carry script
  return ALLOWED_EXACT.has(m) || ALLOWED_PREFIXES.some((p) => m.startsWith(p));
}

/** Strip path separators/control characters from a client-supplied filename. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
    .slice(0, 255);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "file";
}
