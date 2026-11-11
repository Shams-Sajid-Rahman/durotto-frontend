import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/server/db";
import { requireFile } from "@/lib/server/access";

type Ctx = { params: Promise<{ id: string }> };

function setFavorite(id: string, userId: string, on: boolean) {
  updateDB((db) => {
    const f = db.files.find((x) => x.id === id);
    if (!f) return;
    const others = f.favoriteBy.filter((u) => u !== userId);
    f.favoriteBy = on ? [...others, userId] : others;
  });
}

/** Star a file (favorites are per user). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = requireFile(req, id, "view");
  if (!guard.ok) return guard.response;
  setFavorite(id, guard.value.user.id, true);
  return NextResponse.json({ message: "Added to favorites." });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = requireFile(req, id, "view");
  if (!guard.ok) return guard.response;
  setFavorite(id, guard.value.user.id, false);
  return NextResponse.json({ message: "Removed from favorites." });
}
