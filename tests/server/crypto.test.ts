import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  signToken,
  signUploadToken,
  verifyPassword,
  verifyToken,
  verifyUploadToken,
} from "@/lib/server/crypto";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const stored = hashPassword("correct horse");
    expect(stored).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("salts every hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("x", "garbage")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});

describe("access tokens", () => {
  it("round-trips the subject and role", () => {
    const token = signToken({ sub: "user-1", role: "admin" });
    const payload = verifyToken(token);
    expect(payload?.sub).toBe("user-1");
    expect(payload?.role).toBe("admin");
    expect(payload?.typ).toBe("access");
  });

  it("rejects tampered payloads and signatures", () => {
    const token = signToken({ sub: "user-1", role: "user" });
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "user-1", role: "admin", typ: "access", exp: Date.now() + 1e9 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyToken(`${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyToken(`${token}.extra`)).toBeNull();
    expect(verifyToken(null)).toBeNull();
  });

  it("expires", () => {
    vi.useFakeTimers();
    vi.stubEnv("AUTH_TOKEN_TTL_SECONDS", "60");
    const token = signToken({ sub: "user-1", role: "user" });
    expect(verifyToken(token)).not.toBeNull();
    vi.advanceTimersByTime(61_000);
    expect(verifyToken(token)).toBeNull();
  });

  it("is bound to the signing secret", () => {
    vi.stubEnv("AUTH_SECRET", "secret-a");
    const token = signToken({ sub: "user-1", role: "user" });
    vi.stubEnv("AUTH_SECRET", "secret-b");
    expect(verifyToken(token)).toBeNull();
  });

  it("refuses to sign in production without AUTH_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => signToken({ sub: "u", role: "user" })).toThrow(/AUTH_SECRET/);
  });
});

describe("upload tokens", () => {
  it("are scoped to one file", () => {
    const token = signUploadToken("a".repeat(32), "user-1");
    expect(verifyUploadToken(token, "a".repeat(32))).toEqual({ sub: "user-1" });
    expect(verifyUploadToken(token, "b".repeat(32))).toBeNull();
  });

  it("cannot be used as access tokens (and vice versa)", () => {
    const upload = signUploadToken("a".repeat(32), "user-1");
    expect(verifyToken(upload)).toBeNull();
    const access = signToken({ sub: "user-1", role: "user" });
    expect(verifyUploadToken(access, "a".repeat(32))).toBeNull();
  });
});
