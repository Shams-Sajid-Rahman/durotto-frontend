import { NextRequest } from "next/server";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as createRoomRoute } from "@/app/api/rooms/route";
import { POST as joinRoute } from "@/app/api/rooms/join-by-code/route";

export const ADMIN = { email: "admin@gmail.com", password: "admin123" };

interface RequestOptions {
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  rawBody?: BodyInit;
  signal?: AbortSignal;
}

/** Build a NextRequest the way Next.js would hand it to a route handler. */
export function req(method: string, path: string, opts: RequestOptions = {}): NextRequest {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] ??= "application/json";
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    headers,
    body,
    signal: opts.signal,
  });
}

/** Route context with Next 16's Promise-based params. */
export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

let counter = 0;

export async function registerUser(name = "Test User") {
  counter += 1;
  const email = `user${counter}-${Date.now()}@example.com`;
  const res = await registerRoute(
    req("POST", "/api/auth/register", { body: { name, email, password: "password123" } }),
  );
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; user: { id: string; name: string } };
  return { token: data.access_token, user: data.user, email, password: "password123" };
}

export async function loginAs(email: string, password: string) {
  const res = await loginRoute(req("POST", "/api/auth/login", { body: { email, password } }));
  return { res, data: res.ok ? ((await res.json()) as { access_token: string }) : null };
}

export async function createRoom(token: string, name = "Standup", password?: string) {
  const res = await createRoomRoute(
    req("POST", "/api/rooms", { token, body: { name, ...(password ? { password } : {}) } }),
  );
  if (res.status !== 201) throw new Error(`create room failed: ${res.status}`);
  return (await res.json()) as { id: string; join_code: string; name: string };
}

export async function joinRoom(token: string, code: string, password?: string) {
  return joinRoute(req("POST", "/api/rooms/join-by-code", { token, body: { code, password } }));
}
