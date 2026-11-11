import { NextRequest, NextResponse } from "next/server";
import { requireRoomMember } from "@/lib/server/access";
import { connectedPeers } from "@/lib/server/signaling-hub";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const guard = requireRoomMember(req, roomId);
  if (!guard.ok) return guard.response;
  const { user, room } = guard.value;

  // Participants = people connected to the call right now, with the caller first.
  const live = connectedPeers(room.id).filter((p) => p.id !== user.id);
  const participants = [{ id: user.id, name: user.name }, ...live];

  return NextResponse.json({
    id: room.id,
    name: room.name,
    join_code: room.joinCode,
    host_id: room.hostId,
    is_password_protected: room.isPasswordProtected,
    participant_count: participants.length,
    participants,
  });
}
