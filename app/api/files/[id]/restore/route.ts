import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/server/db";
import { requireFile } from "@/lib/server/access";

/** Bring a file back out of Trash. Uploader only. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = requireFile(req, id, "own");
  if (!guard.ok) return guard.response;
  if (!guard.value.file.deletedAt) {
    return NextResponse.json({ detail: "File is not in Trash." }, { status: 409 });
  }

  updateDB((db) => {
    const f = db.files.find((x) => x.id === id);
    if (f) f.deletedAt = null;
  });
  return NextResponse.json({ message: "File restored." });
}
