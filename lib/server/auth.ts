import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/server/crypto";
import { readDB, type DbUser } from "@/lib/server/db";

/** Extract a bearer token from the Authorization header. */
export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Resolve the authenticated user from the request, or null. Suspended (or
 * deleted) accounts are rejected on every request, not just at login, so an
 * admin suspension takes effect immediately.
 */
export function getAuthUser(req: NextRequest): DbUser | null {
  const payload = verifyToken(bearerToken(req));
  if (!payload) return null;
  const user = readDB().users.find((u) => u.id === payload.sub);
  if (!user || user.status !== "active") return null;
  return user;
}

/** Resolve the authenticated user, requiring the admin role. */
export function getAdminUser(req: NextRequest): DbUser | null {
  const user = getAuthUser(req);
  return user && user.role === "admin" ? user : null;
}

/**
 * Admin guard: 401 when there is no valid session (so the client can send the
 * user back to sign in), 403 when the user is signed in but not an admin.
 */
export function requireAdmin(req: NextRequest): DbUser | NextResponse {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  return user;
}

/**
 * Best-effort client IP. Forwarding headers are client-controlled, so they are
 * only trusted when the app runs behind a proxy that sets them (TRUST_PROXY=1).
 */
export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip");
    if (forwarded) return forwarded;
  }
  return "local";
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function str(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ detail: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ detail: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ detail: message }, { status: 404 });
}

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ detail: message }, { status });
}

// ── Rate limiting ───────────────────────────────────────────────────────────────
// Fixed-window counters kept in process memory. Good enough for a single Node
// instance; use a shared store (e.g. Redis) when running several.

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForLimits = globalThis as unknown as { __durottoRateLimits?: Map<string, Bucket> };
const buckets = (globalForLimits.__durottoRateLimits ??= new Map<string, Bucket>());

/** Returns null when allowed, or a 429 response when the limit is exceeded. */
export function rateLimit(key: string, limit: number, windowMs: number): NextResponse | null {
  if (process.env.DUROTTO_DISABLE_RATE_LIMIT === "1") return null;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { detail: "Too many attempts. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export function resetRateLimits(): void {
  buckets.clear();
}
