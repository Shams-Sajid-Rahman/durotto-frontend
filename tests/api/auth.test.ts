import { describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as changePassword } from "@/app/api/auth/change-password/route";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { GET as me } from "@/app/api/users/me/route";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { readDB, updateDB } from "@/lib/server/db";
import { ADMIN, loginAs, registerUser, req } from "../helpers";

describe("POST /api/auth/register", () => {
  it("creates an account, returns a working token and a welcome notification", async () => {
    const { token, user, email } = await registerUser("Ada");
    expect(user.name).toBe("Ada");
    expect(user).not.toHaveProperty("passwordHash");

    const profile = await me(req("GET", "/api/users/me", { token }));
    expect(profile.status).toBe(200);
    expect((await profile.json()).email).toBe(email);

    const notes = await (await listNotifications(req("GET", "/api/notifications", { token }))).json();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/welcome/i);
  });

  it("validates input", async () => {
    const cases = [
      { name: "", email: "a@b.co", password: "password123" },
      { name: "A", email: "not-an-email", password: "password123" },
      { name: "A", email: "a@b.co", password: "short" },
      { name: "A", email: "a@b.co", password: "x".repeat(129) },
    ];
    for (const body of cases) {
      const res = await register(req("POST", "/api/auth/register", { body }));
      expect(res.status).toBe(400);
    }
  });

  it("rejects duplicate emails case-insensitively", async () => {
    const { email } = await registerUser();
    const res = await register(
      req("POST", "/api/auth/register", { body: { name: "B", email: email.toUpperCase(), password: "password123" } }),
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  it("signs in with the right password and records the attempt", async () => {
    const { email, password } = await registerUser();
    const { res, data } = await loginAs(email, password);
    expect(res.status).toBe(200);
    expect(data?.access_token).toBeTruthy();
    expect(readDB().sessions.some((s) => s.email === email && s.success)).toBe(true);
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    const { email } = await registerUser();
    const wrong = await loginAs(email, "nope-nope");
    const unknown = await loginAs("nobody@example.com", "whatever1");
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(await wrong.res.json()).toEqual(await unknown.res.json());
  });

  it("rate-limits repeated attempts on one account", async () => {
    const { email } = await registerUser();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await loginAs(email, "wrong-password")).res.status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("token enforcement", () => {
  it("rejects missing and garbage tokens", async () => {
    expect((await me(req("GET", "/api/users/me"))).status).toBe(401);
    expect((await me(req("GET", "/api/users/me", { token: "abc.def" }))).status).toBe(401);
  });

  it("locks out a suspended user immediately, even with a valid token", async () => {
    const { token, user, email, password } = await registerUser();
    updateDB((db) => {
      db.users.find((u) => u.id === user.id)!.status = "suspended";
    });
    expect((await me(req("GET", "/api/users/me", { token }))).status).toBe(401);
    expect((await loginAs(email, password)).res.status).toBe(403);
  });
});

describe("POST /api/auth/change-password", () => {
  it("requires the current password and enforces length", async () => {
    const { token, email, password } = await registerUser();
    const bad = await changePassword(
      req("POST", "/api/auth/change-password", { token, body: { currentPassword: "nope", newPassword: "newpassword1" } }),
    );
    expect(bad.status).toBe(400);

    const short = await changePassword(
      req("POST", "/api/auth/change-password", { token, body: { currentPassword: password, newPassword: "short" } }),
    );
    expect(short.status).toBe(400);

    const ok = await changePassword(
      req("POST", "/api/auth/change-password", { token, body: { currentPassword: password, newPassword: "newpassword1" } }),
    );
    expect(ok.status).toBe(200);
    expect((await loginAs(email, "newpassword1")).res.status).toBe(200);
    expect((await loginAs(email, password)).res.status).toBe(401);
  });
});

describe("POST /api/admin/login", () => {
  it("only admits admins", async () => {
    const { email, password } = await registerUser();
    expect((await adminLogin(req("POST", "/api/admin/login", { body: { email, password } }))).status).toBe(401);
    const res = await adminLogin(req("POST", "/api/admin/login", { body: ADMIN }));
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe("admin");
  });
});
