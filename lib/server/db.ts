import { randomBytes, randomInt } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hashPassword } from "@/lib/server/crypto";

// ── Types ───────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "user" | "admin";
  bio?: string;
  avatarUrl?: string;
  status: "active" | "suspended";
  settingsJson: string; // serialized UserSettings
  createdAt: string;
}

export interface DbRoom {
  id: string;
  name: string;
  joinCode: string;
  hostId: string;
  passwordHash?: string;
  isPasswordProtected: boolean;
  /** Users allowed into the room (host + everyone who joined with the code). */
  memberIds: string[];
  createdAt: string;
}

/** A login attempt (successful or not) — powers the admin login history. */
export interface DbSession {
  id: string;
  userId: string | null;
  email: string;
  ip: string;
  userAgent: string;
  success: boolean;
  at: string;
}

export interface DbCall {
  id: string;
  roomId: string;
  roomName: string;
  hostId: string;
  participantCount: number;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
}

export interface DbNotification {
  id: string;
  userId: string;
  type: "join" | "upload" | "mention" | "system";
  title: string;
  body: string;
  read: boolean;
  payload?: { roomId?: string; fileId?: string; targetUrl?: string };
  createdAt: string;
}

export interface DbFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploaderId: string;
  roomId: string | null;
  status: "pending" | "ready";
  /** Users who starred this file (favorites are per-user). */
  favoriteBy: string[];
  deletedAt: string | null;
  createdAt: string;
}

export interface DbMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  payload: {
    text?: string;
    fileId?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
  };
  sentAt: string;
}

export interface DbStroke {
  roomId: string;
  strokeId: string;
  objectData: unknown;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface Database {
  users: DbUser[];
  rooms: DbRoom[];
  sessions: DbSession[];
  calls: DbCall[];
  notifications: DbNotification[];
  files: DbFile[];
  messages: DbMessage[];
  strokes: DbStroke[];
}

// ── Storage locations ───────────────────────────────────────────────────────────

// Runtime data paths, not build inputs: the ignore comments stop Next's output
// file tracing from treating `process.cwd()` as "bundle the whole project".

/** Resolved lazily so tests (and deployments) can point at another file. */
export function dbPath(): string {
  const fromEnv = process.env.DUROTTO_DB_PATH;
  return fromEnv
    ? resolve(/* turbopackIgnore: true */ fromEnv)
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "db.json");
}

export function uploadsDir(): string {
  const fromEnv = process.env.DUROTTO_UPLOADS_DIR;
  return fromEnv
    ? resolve(/* turbopackIgnore: true */ fromEnv)
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "uploads");
}

// ── Id helpers ──────────────────────────────────────────────────────────────────

export function genId(): string {
  return randomBytes(16).toString("hex");
}

export const JOIN_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    // crypto-grade randomness: join codes are access credentials
    code += JOIN_CODE_CHARSET[randomInt(JOIN_CODE_CHARSET.length)];
  }
  return code;
}

// ── Seeding ─────────────────────────────────────────────────────────────────────

function emptyDb(): Database {
  return {
    users: [],
    rooms: [],
    sessions: [],
    calls: [],
    notifications: [],
    files: [],
    messages: [],
    strokes: [],
  };
}

/**
 * Initial accounts. The admin login comes from DUROTTO_ADMIN_EMAIL /
 * DUROTTO_ADMIN_PASSWORD. Outside production a well-known dev admin and a demo
 * user are created so the app is usable straight after `npm run dev`; in
 * production nothing is seeded unless the admin env vars are set.
 */
function seed(): Database {
  const db = emptyDb();
  const now = new Date().toISOString();
  const isProd = process.env.NODE_ENV === "production";

  const adminEmail =
    process.env.DUROTTO_ADMIN_EMAIL ?? (isProd ? undefined : "admin@gmail.com");
  const adminPassword =
    process.env.DUROTTO_ADMIN_PASSWORD ?? (isProd ? undefined : "admin123");

  if (adminEmail && adminPassword) {
    db.users.push({
      id: genId(),
      name: "Admin",
      email: adminEmail.trim().toLowerCase(),
      passwordHash: hashPassword(adminPassword),
      role: "admin",
      status: "active",
      settingsJson: "{}",
      createdAt: now,
    });
  }

  if (!isProd && process.env.DUROTTO_SEED_DEMO !== "0") {
    db.users.push({
      id: genId(),
      name: "Demo User",
      email: "demo@durotto.app",
      passwordHash: hashPassword("demo1234"),
      role: "user",
      bio: "Just here to test Durotto.",
      status: "active",
      settingsJson: "{}",
      createdAt: now,
    });
  }

  return db;
}

// ── Read / write ────────────────────────────────────────────────────────────────

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, contents);
  try {
    renameSync(tmp, path);
  } catch {
    // Windows can refuse the rename while another process holds the file open.
    writeFileSync(path, contents);
  }
}

/** Fill in collections/fields that older db.json files don't have. */
function normalize(raw: Partial<Database>): Database {
  const db: Database = {
    users: raw.users ?? [],
    rooms: raw.rooms ?? [],
    sessions: raw.sessions ?? [],
    calls: raw.calls ?? [],
    notifications: raw.notifications ?? [],
    files: raw.files ?? [],
    messages: raw.messages ?? [],
    strokes: raw.strokes ?? [],
  };
  for (const room of db.rooms) {
    if (!Array.isArray(room.memberIds)) room.memberIds = [room.hostId];
  }
  for (const file of db.files) {
    if (!Array.isArray(file.favoriteBy)) file.favoriteBy = [];
  }
  return db;
}

export function readDB(): Database {
  const path = dbPath();
  if (!existsSync(path)) {
    const fresh = seed();
    atomicWrite(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const raw = readFileSync(path, "utf-8");
  try {
    return normalize(JSON.parse(raw) as Partial<Database>);
  } catch {
    // Never silently discard data: keep the unreadable file for recovery.
    copyFileSync(path, `${path}.corrupt-${Date.now()}`);
    const fresh = seed();
    atomicWrite(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

export function writeDB(db: Database): void {
  atomicWrite(dbPath(), JSON.stringify(db, null, 2));
}

/**
 * Read, mutate, and persist in one shot. Returns whatever the mutator returns.
 * Everything here is synchronous, so a single Node process can't interleave two
 * updates.
 */
export function updateDB<T>(mutator: (db: Database) => T): T {
  const db = readDB();
  const result = mutator(db);
  writeDB(db);
  return result;
}

// ── Public projections (never leak passwordHash) ────────────────────────────────

export function publicUser(u: DbUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    status: u.status,
    createdAt: u.createdAt,
  };
}

// ── Room access ─────────────────────────────────────────────────────────────────

export function isRoomMember(room: DbRoom, userId: string): boolean {
  return room.hostId === userId || room.memberIds.includes(userId);
}

// ── Notifications ───────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS_PER_USER = 100;

export function pushNotification(
  db: Database,
  n: Omit<DbNotification, "id" | "read" | "createdAt">,
): void {
  db.notifications.push({
    ...n,
    id: genId(),
    read: false,
    createdAt: new Date().toISOString(),
  });
  const mine = db.notifications.filter((x) => x.userId === n.userId);
  if (mine.length > MAX_NOTIFICATIONS_PER_USER) {
    const drop = new Set(
      mine
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, mine.length - MAX_NOTIFICATIONS_PER_USER)
        .map((x) => x.id),
    );
    db.notifications = db.notifications.filter((x) => !drop.has(x.id));
  }
}
