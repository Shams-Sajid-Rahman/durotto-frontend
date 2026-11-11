import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/server/db";
import { requireFile } from "@/lib/server/access";
import { removeStoredFile } from "@/lib/server/storage";

/** Permanently delete a file (metadata and bytes). Uploader only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = requireFile(req, id, "own");
  if (!guard.ok) return guard.response;

  updateDB((db) => {
    db.files = db.files.filter((f) => f.id !== id);
  });
  removeStoredFile(id);
  return NextResponse.json({ message: "File deleted permanently." });
}
