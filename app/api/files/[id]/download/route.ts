import { readFileSync, existsSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { requireFile } from "@/lib/server/access";
import { storedFilePath } from "@/lib/server/storage";

/** Stream a file's bytes to someone allowed to see it. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = requireFile(req, id, "view");
  if (!guard.ok) return guard.response;
  const { file } = guard.value;

  if (file.status !== "ready") {
    return NextResponse.json({ detail: "File has not been uploaded yet." }, { status: 409 });
  }
  const path = storedFilePath(file.id);
  if (!existsSync(path)) {
    return NextResponse.json({ detail: "File content not found on server." }, { status: 404 });
  }

  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(readFileSync(path)), {
    headers: {
      "Content-Type": file.mimeType,
      // Always a download, never rendered inline on our origin.
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
