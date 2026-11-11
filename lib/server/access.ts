import { NextRequest, NextResponse } from "next/server";
import { forbidden, getAuthUser, notFound, unauthorized } from "@/lib/server/auth";
import {
  isRoomMember,
  readDB,
  type Database,
  type DbFile,
  type DbRoom,
  type DbUser,
} from "@/lib/server/db";
import { connectedPeers } from "@/lib/server/signaling-hub";

export type Guarded<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/**
 * Authenticate and require room membership. Non-members get 404 rather than
 * 403 so room ids can't be probed for existence.
 */
export function requireRoomMember(
  req: NextRequest,
  roomId: string,
): Guarded<{ user: DbUser; room: DbRoom; db: Database }> {
  const user = getAuthUser(req);
  if (!user) return { ok: false, response: unauthorized() };
  const db = readDB();
  const room = db.rooms.find((r) => r.id === roomId);
  if (!room || !isRoomMember(room, user.id)) {
    return { ok: false, response: notFound("Room not found.") };
  }
  return { ok: true, value: { user, room, db } };
}

export function roomView(room: DbRoom) {
  return {
    id: room.id,
    name: room.name,
    join_code: room.joinCode,
    host_id: room.hostId,
    is_password_protected: room.isPasswordProtected,
    participant_count: connectedPeers(room.id).length,
    member_count: room.memberIds.length,
    created_at: room.createdAt,
  };
}

/** Can this user see (download, favorite) the file? */
export function canViewFile(db: Database, file: DbFile, userId: string): boolean {
  if (file.uploaderId === userId) return true;
  if (!file.roomId || file.deletedAt) return false;
  const room = db.rooms.find((r) => r.id === file.roomId);
  return !!room && isRoomMember(room, userId);
}

export function fileView(db: Database, file: DbFile, viewerId: string) {
  const uploader = db.users.find((u) => u.id === file.uploaderId);
  const room = file.roomId ? db.rooms.find((r) => r.id === file.roomId) : undefined;
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    uploaderId: file.uploaderId,
    uploaderName: uploader?.name ?? "(deleted user)",
    uploadedAt: file.createdAt,
    roomId: file.roomId ?? undefined,
    roomName: room?.name,
    roomOwnerId: room?.hostId,
    isFavorite: file.favoriteBy.includes(viewerId),
    deletedAt: file.deletedAt,
  };
}

/** Load a file the user may act on, or produce the right error response. */
export function requireFile(
  req: NextRequest,
  fileId: string,
  mode: "view" | "own",
): Guarded<{ user: DbUser; file: DbFile; db: Database }> {
  const user = getAuthUser(req);
  if (!user) return { ok: false, response: unauthorized() };
  const db = readDB();
  const file = db.files.find((f) => f.id === fileId);
  if (!file || !canViewFile(db, file, user.id)) {
    return { ok: false, response: notFound("File not found.") };
  }
  if (mode === "own" && file.uploaderId !== user.id) {
    return { ok: false, response: forbidden("Only the uploader can do that.") };
  }
  return { ok: true, value: { user, file, db } };
}
