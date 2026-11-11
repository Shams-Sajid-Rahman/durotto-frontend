import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/server/db";
import { readJson, str } from "@/lib/server/auth";
import { fileView, requireFile } from "@/lib/server/access";
import { sanitizeFileName } from "@/lib/server/storage";

/** Rename a file. Uploader only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = requireFile(req, id, "own");
  if (!guard.ok) return guard.response;

  const body = await readJson(req);
  const raw = str(body.name, 255);
  if (!raw) return NextResponse.json({ detail: "A file name is required." }, { status: 422 });
  const name = sanitizeFileName(raw);

  const view = updateDB((db) => {
    const f = db.files.find((x) => x.id === id);
    if (!f) return null;
    f.name = name;
    return fileView(db, f, guard.value.user.id);
  });
  return NextResponse.json(view);
}

/** Move a file to Trash (soft delete; restorable). Uploader only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = requireFile(req, id, "own");
  if (!guard.ok) return guard.response;

  updateDB((db) => {
    const f = db.files.find((x) => x.id === id);
    if (f && !f.deletedAt) f.deletedAt = new Date().toISOString();
  });
  return NextResponse.json({ message: "Moved to Trash." });
}
