import { NextRequest, NextResponse } from "next/server";
import { isRoomMember, readDB } from "@/lib/server/db";
import { getAuthUser, unauthorized } from "@/lib/server/auth";
import { activeRoomIds, connectedPeers } from "@/lib/server/signaling-hub";

/**
 * People currently in a call in any room the caller belongs to — the only
 * presence the server can vouch for.
 */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const db = readDB();
  const roomsById = new Map(db.rooms.map((r) => [r.id, r]));
  const seen = new Map<string, { id: string; name: string; roomId: string; roomName: string }>();

  for (const roomId of activeRoomIds()) {
    const room = roomsById.get(roomId);
    if (!room || !isRoomMember(room, user.id)) continue;
    for (const peer of connectedPeers(roomId)) {
      if (peer.id === user.id || seen.has(peer.id)) continue;
      seen.set(peer.id, { id: peer.id, name: peer.name, roomId, roomName: room.name });
    }
  }
  return NextResponse.json([...seen.values()]);
}
