import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  updateDB((db) => {
    for (const n of db.notifications) if (n.userId === user.id) n.read = true;
  });
  return NextResponse.json({ message: "All notifications marked as read." });
}
