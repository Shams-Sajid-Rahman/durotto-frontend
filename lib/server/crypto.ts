import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const DEV_SECRET = "durotto-dev-secret-change-me";

/**
 * HMAC signing secret. Read lazily (not at import time) so `next build` can
 * load route modules without it; in production a missing secret is fatal
 * because tokens signed with a public default could be forged by anyone.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return DEV_SECRET;
}

// ── Password hashing (scrypt) ───────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  if (derived.length !== original.length) return false;
  return timingSafeEqual(derived, original);
}

// A real hash of a random string — verified against when the user doesn't
// exist so a login for an unknown email costs the same scrypt work as a real
// one (prevents user enumeration via response timing).
let dummyHash: string | null = null;
export function burnPasswordCheck(password: string): void {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  verifyPassword(password, dummyHash);
}

// ── Signed tokens (HMAC, JWT-ish) ───────────────────────────────────────────────

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

function encode(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function accessTokenTtlMs(): number {
  const seconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 7 * 24 * 3600) * 1000;
}

export interface TokenPayload {
  typ: "access";
  sub: string; // user id
  role: "user" | "admin";
  iat: number; // ms since epoch
  exp: number; // ms since epoch
}

export function signToken(payload: { sub: string; role: "user" | "admin" }): string {
  const now = Date.now();
  return encode({ ...payload, typ: "access", iat: now, exp: now + accessTokenTtlMs() });
}

export function verifyToken(token: string | null | undefined): TokenPayload | null {
  const payload = decode(token);
  if (!payload || payload.typ !== "access" || typeof payload.sub !== "string") return null;
  return payload as unknown as TokenPayload;
}

// ── Upload capability tokens ────────────────────────────────────────────────────
// The upload URL returned by /files/presign carries one of these so the browser
// can PUT bytes without an Authorization header (like an S3 presigned URL). It
// is scoped to a single file id and expires quickly.

const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

export function signUploadToken(fileId: string, userId: string): string {
  return encode({ typ: "upload", fid: fileId, sub: userId, exp: Date.now() + UPLOAD_TOKEN_TTL_MS });
}

export function verifyUploadToken(
  token: string | null | undefined,
  fileId: string,
): { sub: string } | null {
  const payload = decode(token);
  if (!payload || payload.typ !== "upload" || payload.fid !== fileId) return null;
  return typeof payload.sub === "string" ? { sub: payload.sub } : null;
}
