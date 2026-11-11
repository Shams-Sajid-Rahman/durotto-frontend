import { genId, readDB, updateDB, type DbMessage } from "@/lib/server/db";

/**
 * In-process signaling relay for WebRTC + room events.
 *
 * Each browser holds one streaming GET (server → client) per room and sends
 * messages with POST (client → server). The hub fans messages out to the other
 * members, always stamping `senderId`/`senderName` server-side so clients can't
 * impersonate each other. State lives in memory on `globalThis` so it survives
 * Next.js dev hot-reloads; run a single instance (or move this to Redis
 * pub/sub) in production.
 */

export interface SignalPeer {
  id: string;
  name: string;
}

export interface OutboundMessage {
  type: string;
  senderId?: string;
  senderName?: string;
  targetUserId?: string;
  payload?: unknown;
}

export interface Connection {
  connectionId: string;
  userId: string;
  userName: string;
  send: (message: OutboundMessage) => boolean;
  close: () => void;
}

interface RoomState {
  connections: Map<string, Connection>; // userId → connection
  callId: string;
  startedAt: number;
  uniqueUsers: Set<string>;
}

/** Message types clients may send. Anything else is rejected. */
export const CLIENT_MESSAGE_TYPES = new Set([
  "offer",
  "answer",
  "ice-candidate",
  "chat-message",
  "draw",
  "cursor",
]);

export const MAX_MESSAGE_BYTES = 512 * 1024;
const MAX_MESSAGES_PER_ROOM = 500;
const MAX_STROKES_PER_ROOM = 2000;

const globalForHub = globalThis as unknown as { __durottoSignalingRooms?: Map<string, RoomState> };
const rooms = (globalForHub.__durottoSignalingRooms ??= new Map<string, RoomState>());

function roomName(roomId: string): { name: string; hostId: string } {
  const room = readDB().rooms.find((r) => r.id === roomId);
  return { name: room?.name ?? "(deleted room)", hostId: room?.hostId ?? "" };
}

function startCall(roomId: string): RoomState {
  const { name, hostId } = roomName(roomId);
  const state: RoomState = {
    connections: new Map(),
    callId: genId(),
    startedAt: Date.now(),
    uniqueUsers: new Set(),
  };
  updateDB((db) => {
    db.calls.push({
      id: state.callId,
      roomId,
      roomName: name,
      hostId,
      participantCount: 0,
      startedAt: new Date(state.startedAt).toISOString(),
      endedAt: null,
      durationSec: 0,
    });
  });
  return state;
}

function endCall(state: RoomState): void {
  const endedAt = Date.now();
  updateDB((db) => {
    const call = db.calls.find((c) => c.id === state.callId);
    if (!call) return;
    call.endedAt = new Date(endedAt).toISOString();
    call.durationSec = Math.round((endedAt - state.startedAt) / 1000);
    call.participantCount = state.uniqueUsers.size;
  });
}

/**
 * Register a connection. Returns the peers that were already in the room. If
 * the same user was already connected (another tab, or a stale stream after a
 * network drop) the older connection is told it was replaced and closed.
 */
export function joinRoom(roomId: string, conn: Connection): SignalPeer[] {
  let state = rooms.get(roomId);
  if (!state) {
    state = startCall(roomId);
    rooms.set(roomId, state);
  }

  const previous = state.connections.get(conn.userId);
  if (previous && previous.connectionId !== conn.connectionId) {
    previous.send({ type: "session-replaced" });
    previous.close();
  }

  const peers: SignalPeer[] = [...state.connections.values()]
    .filter((c) => c.userId !== conn.userId)
    .map((c) => ({ id: c.userId, name: c.userName }));

  state.connections.set(conn.userId, conn);
  if (!state.uniqueUsers.has(conn.userId)) {
    state.uniqueUsers.add(conn.userId);
    const count = state.uniqueUsers.size;
    updateDB((db) => {
      const call = db.calls.find((c) => c.id === state!.callId);
      if (call) call.participantCount = count;
    });
  }

  conn.send({ type: "welcome", payload: { peers } });
  // Only announce if this is a new presence (not a same-user replacement).
  broadcast(roomId, conn.userId, {
    type: previous ? "peer-rejoined" : "peer-joined",
    senderId: conn.userId,
    senderName: conn.userName,
  });
  return peers;
}

/** Remove a connection (no-op if it was already replaced by a newer one). */
export function leaveRoom(roomId: string, connectionId: string): void {
  const state = rooms.get(roomId);
  if (!state) return;
  const entry = [...state.connections.values()].find((c) => c.connectionId === connectionId);
  if (!entry) return;
  state.connections.delete(entry.userId);
  broadcast(roomId, entry.userId, {
    type: "peer-left",
    senderId: entry.userId,
    senderName: entry.userName,
  });
  if (state.connections.size === 0) {
    rooms.delete(roomId);
    endCall(state);
  }
}

function broadcast(roomId: string, exceptUserId: string, message: OutboundMessage): void {
  const state = rooms.get(roomId);
  if (!state) return;
  for (const conn of state.connections.values()) {
    if (conn.userId !== exceptUserId) conn.send(message);
  }
}

/**
 * Relay a client message. With `targetUserId` it goes to that peer only;
 * otherwise to everyone else in the room. Returns how many peers received it.
 */
export function relay(
  roomId: string,
  sender: SignalPeer,
  message: { type: string; targetUserId?: string; payload?: unknown },
): number {
  const state = rooms.get(roomId);
  if (!state) return 0;
  const outbound: OutboundMessage = {
    type: message.type,
    payload: message.payload,
    senderId: sender.id,
    senderName: sender.name,
    ...(message.targetUserId ? { targetUserId: message.targetUserId } : {}),
  };
  if (message.targetUserId) {
    const target = state.connections.get(message.targetUserId);
    return target && target.send(outbound) ? 1 : 0;
  }
  let delivered = 0;
  for (const conn of state.connections.values()) {
    if (conn.userId !== sender.id && conn.send(outbound)) delivered += 1;
  }
  return delivered;
}

export function connectedPeers(roomId: string): SignalPeer[] {
  const state = rooms.get(roomId);
  if (!state) return [];
  return [...state.connections.values()].map((c) => ({ id: c.userId, name: c.userName }));
}

export function activeRoomIds(): string[] {
  return [...rooms.keys()];
}

/** Test helper: drop all in-memory rooms without touching the database. */
export function resetHub(): void {
  for (const state of rooms.values()) {
    for (const conn of state.connections.values()) conn.close();
  }
  rooms.clear();
}

// ── Persistence of room events ──────────────────────────────────────────────────

function asString(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;
}

/** Store chat messages and whiteboard strokes so late joiners get history. */
export function persistRoomEvent(
  roomId: string,
  sender: SignalPeer,
  message: { type: string; payload?: unknown },
): void {
  const payload = (message.payload ?? {}) as Record<string, unknown>;

  if (message.type === "chat-message") {
    const stored: DbMessage["payload"] = {
      text: asString(payload.text, 4000),
      fileId: asString(payload.fileId, 64),
      fileName: asString(payload.fileName, 255),
      fileSize: typeof payload.fileSize === "number" ? payload.fileSize : undefined,
      fileType: asString(payload.fileType, 100),
    };
    if (!stored.text && !stored.fileId) return;
    updateDB((db) => {
      db.messages.push({
        id: genId(),
        roomId,
        senderId: sender.id,
        senderName: sender.name,
        payload: stored,
        sentAt: new Date().toISOString(),
      });
      const inRoom = db.messages.filter((m) => m.roomId === roomId);
      if (inRoom.length > MAX_MESSAGES_PER_ROOM) {
        const drop = new Set(inRoom.slice(0, inRoom.length - MAX_MESSAGES_PER_ROOM).map((m) => m.id));
        db.messages = db.messages.filter((m) => !drop.has(m.id));
      }
    });
    return;
  }

  if (message.type === "draw") {
    const strokeId = asString(payload.strokeId, 100);
    if (!strokeId) return;
    updateDB((db) => {
      if (payload.action === "remove") {
        db.strokes = db.strokes.filter((s) => !(s.roomId === roomId && s.strokeId === strokeId));
        return;
      }
      const existing = db.strokes.find((s) => s.roomId === roomId && s.strokeId === strokeId);
      if (payload.action === "update" && existing) {
        existing.objectData = payload.objectData ?? existing.objectData;
        return;
      }
      if (payload.action !== "add" && payload.action !== "update") return;
      if (existing) return;
      const count = db.strokes.filter((s) => s.roomId === roomId).length;
      if (count >= MAX_STROKES_PER_ROOM) return;
      db.strokes.push({
        roomId,
        strokeId,
        objectData: payload.objectData ?? null,
        userId: sender.id,
        userName: sender.name,
        createdAt: new Date().toISOString(),
      });
    });
  }
}
