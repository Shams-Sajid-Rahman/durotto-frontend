import type { Database } from "@/lib/server/db";
import { removeStoredFile } from "@/lib/server/storage";

/**
 * Remove a user and everything that only makes sense with them: their
 * memberships, the rooms they host (and those rooms' files, messages and
 * whiteboards), their own uploads and notifications. Login history is kept for
 * the audit trail (it already shows "(deleted user)").
 *
 * Mutates `db`; call inside `updateDB`. Stored file bytes are removed from disk.
 */
export function deleteUserCascade(db: Database, userId: string): boolean {
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;
  db.users.splice(idx, 1);

  const hostedRoomIds = new Set(db.rooms.filter((r) => r.hostId === userId).map((r) => r.id));
  db.rooms = db.rooms.filter((r) => !hostedRoomIds.has(r.id));
  for (const room of db.rooms) {
    room.memberIds = room.memberIds.filter((id) => id !== userId);
  }

  const doomedFiles = db.files.filter(
    (f) => f.uploaderId === userId || (f.roomId !== null && hostedRoomIds.has(f.roomId)),
  );
  for (const file of doomedFiles) removeStoredFile(file.id);
  const doomedIds = new Set(doomedFiles.map((f) => f.id));
  db.files = db.files.filter((f) => !doomedIds.has(f.id));
  for (const file of db.files) {
    file.favoriteBy = file.favoriteBy.filter((id) => id !== userId);
  }

  db.messages = db.messages.filter((m) => !hostedRoomIds.has(m.roomId));
  db.strokes = db.strokes.filter((s) => !hostedRoomIds.has(s.roomId));
  db.notifications = db.notifications.filter((n) => n.userId !== userId);
  return true;
}
