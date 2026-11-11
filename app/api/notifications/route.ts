import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";

/** The caller's notifications, newest first. */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const items = readDB()
    .notifications.filter((n) => n.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.read,
      createdAt: n.createdAt,
      payload: n.payload,
    }));
  return NextResponse.json(items);
}
