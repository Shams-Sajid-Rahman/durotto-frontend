import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/server/db";
import { getAuthUser, notFound, unauthorized } from "@/lib/server/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  const { id } = await params;

  // Scoped to the caller: someone else's notification id behaves as missing.
  const found = updateDB((db) => {
    const n = db.notifications.find((x) => x.id === id && x.userId === user.id);
    if (n) n.read = true;
    return !!n;
  });
  if (!found) return notFound("Notification not found.");
  return NextResponse.json({ message: "Notification marked as read." });
}
