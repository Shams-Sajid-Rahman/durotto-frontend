import { describe, expect, it } from "vitest";
import { DELETE as deleteMe, PATCH as updateMe } from "@/app/api/users/me/route";
import { GET as getSettings, PATCH as patchSettings } from "@/app/api/users/me/settings/route";
import { GET as signIns } from "@/app/api/users/me/sessions/route";
import { GET as exportData } from "@/app/api/users/me/export/route";
import { GET as stats } from "@/app/api/admin/stats/route";
import { GET as adminUsers } from "@/app/api/admin/users/route";
import { DELETE as adminDelete, PATCH as adminPatch } from "@/app/api/admin/users/[id]/route";
import { readDB } from "@/lib/server/db";
import { ADMIN, createRoom, ctx, loginAs, registerUser, req } from "../helpers";

describe("profile", () => {
  it("updates name and bio, and validates avatars", async () => {
    const { token } = await registerUser();
    const ok = await updateMe(req("PATCH", "/x", { token, body: { name: "  New Name ", bio: "hi" } }));
    expect(await ok.json()).toMatchObject({ name: "New Name", bio: "hi" });

    const png = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
    expect((await updateMe(req("PATCH", "/x", { token, body: { avatarUrl: png } }))).status).toBe(200);
    expect((await updateMe(req("PATCH", "/x", { token, body: { avatarUrl: "javascript:alert(1)" } }))).status).toBe(422);
    expect((await updateMe(req("PATCH", "/x", { token, body: { avatarUrl: "data:image/svg+xml;base64,AA==" } }))).status).toBe(422);
  });
});

describe("settings", () => {
  it("merges known keys only", async () => {
    const { token, user } = await registerUser();
    const res = await patchSettings(
      req("PATCH", "/x", {
        token,
        body: { theme: "light", status: "bogus", notifications: { sounds: true, evil: 1 }, isAdmin: true },
      }),
    );
    const merged = await res.json();
    expect(merged.theme).toBe("light");
    expect(merged.status).toBe("online");
    expect(merged.notifications.sounds).toBe(true);
    expect(merged).not.toHaveProperty("isAdmin");
    expect(merged.notifications).not.toHaveProperty("evil");

    expect(await (await getSettings(req("GET", "/x", { token }))).json()).toEqual(merged);
    expect(readDB().users.find((u) => u.id === user.id)?.role).toBe("user");
  });
});

describe("account data", () => {
  it("lists sign-ins and exports data without secrets", async () => {
    const { token, email, password } = await registerUser();
    await loginAs(email, "wrong-password");
    await loginAs(email, password);

    const history = await (await signIns(req("GET", "/x", { token }))).json();
    expect(history.length).toBeGreaterThanOrEqual(3);
    expect(history.some((h: { success: boolean }) => !h.success)).toBe(true);

    const res = await exportData(req("GET", "/x", { token }));
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const text = await res.text();
    expect(JSON.parse(text).profile.email).toBe(email);
    expect(text).not.toContain("passwordHash");
  });

  it("deletes the account (and hosted rooms) only with the password", async () => {
    const { token, user } = await registerUser();
    const room = await createRoom(token);
    expect((await deleteMe(req("DELETE", "/x", { token, body: { password: "nope" } }))).status).toBe(400);
    expect((await deleteMe(req("DELETE", "/x", { token, body: { password: "password123" } }))).status).toBe(200);
    const db = readDB();
    expect(db.users.some((u) => u.id === user.id)).toBe(false);
    expect(db.rooms.some((r) => r.id === room.id)).toBe(false);
  });
});

describe("admin API", () => {
  async function adminToken() {
    const { data } = await loginAs(ADMIN.email, ADMIN.password);
    return data!.access_token;
  }

  it("distinguishes signed-out (401) from not-an-admin (403)", async () => {
    const { token } = await registerUser();
    expect((await stats(req("GET", "/x"))).status).toBe(401);
    expect((await stats(req("GET", "/x", { token }))).status).toBe(403);
    expect((await stats(req("GET", "/x", { token: await adminToken() }))).status).toBe(200);
  });

  it("never returns password hashes", async () => {
    const res = await adminUsers(req("GET", "/x", { token: await adminToken() }));
    expect(JSON.stringify(await res.json())).not.toContain("passwordHash");
  });

  it("stops an admin from locking themselves out", async () => {
    const token = await adminToken();
    const adminId = readDB().users.find((u) => u.role === "admin")!.id;
    const demote = await adminPatch(req("PATCH", "/x", { token, body: { role: "user" } }), ctx({ id: adminId }));
    expect(demote.status).toBe(400);
    expect((await adminDelete(req("DELETE", "/x", { token }), ctx({ id: adminId }))).status).toBe(400);
  });

  it("suspends and deletes other users", async () => {
    const token = await adminToken();
    const victim = await registerUser("Victim");
    const suspend = await adminPatch(
      req("PATCH", "/x", { token, body: { status: "suspended" } }),
      ctx({ id: victim.user.id }),
    );
    expect((await suspend.json()).status).toBe("suspended");
    expect((await loginAs(victim.email, victim.password)).res.status).toBe(403);

    expect((await adminDelete(req("DELETE", "/x", { token }), ctx({ id: victim.user.id }))).status).toBe(200);
    expect(readDB().users.some((u) => u.id === victim.user.id)).toBe(false);
  });
});
