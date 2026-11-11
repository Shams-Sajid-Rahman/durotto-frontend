import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOIN_CODE_CHARSET,
  dbPath,
  genJoinCode,
  pushNotification,
  readDB,
  updateDB,
} from "@/lib/server/db";
import { isAllowedMime, sanitizeFileName, storedFilePath } from "@/lib/server/storage";

describe("json database", () => {
  it("seeds a dev admin and demo user on first read", () => {
    const db = readDB();
    expect(existsSync(dbPath())).toBe(true);
    expect(db.users.map((u) => u.email).sort()).toEqual(["admin@gmail.com", "demo@durotto.app"]);
    expect(db.users.find((u) => u.role === "admin")).toBeDefined();
    // never stores plaintext passwords
    expect(JSON.stringify(db)).not.toContain("admin123");
  });

  it("persists updates", () => {
    updateDB((db) => {
      db.users[0].name = "Renamed";
    });
    expect(readDB().users[0].name).toBe("Renamed");
  });

  it("backfills fields for databases written by older versions", () => {
    writeFileSync(
      dbPath(),
      JSON.stringify({
        users: [],
        rooms: [{ id: "r1", name: "Old", joinCode: "ABCDEF", hostId: "u1", isPasswordProtected: false, createdAt: "" }],
      }),
    );
    const db = readDB();
    expect(db.rooms[0].memberIds).toEqual(["u1"]);
    expect(db.files).toEqual([]);
    expect(db.messages).toEqual([]);
  });

  it("keeps a backup instead of silently discarding a corrupt file", () => {
    readDB();
    writeFileSync(dbPath(), "{ not json");
    const db = readDB();
    expect(db.users.length).toBeGreaterThan(0);
    const backups = readdirSync(dirname(dbPath())).filter((f) => f.includes(".corrupt-"));
    expect(backups).toHaveLength(1);
  });

  it("generates join codes from the unambiguous charset", () => {
    for (let i = 0; i < 200; i++) {
      const code = genJoinCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(JOIN_CODE_CHARSET).toContain(ch);
    }
  });

  it("caps notifications per user", () => {
    updateDB((db) => {
      for (let i = 0; i < 120; i++) {
        pushNotification(db, { userId: "u1", type: "system", title: `n${i}`, body: "" });
      }
    });
    expect(readDB().notifications.filter((n) => n.userId === "u1")).toHaveLength(100);
  });
});

describe("file storage helpers", () => {
  it("only maps server-generated ids to paths", () => {
    expect(() => storedFilePath("../../etc/passwd")).toThrow();
    expect(() => storedFilePath("a".repeat(32))).not.toThrow();
  });

  it("sanitizes client filenames", () => {
    expect(sanitizeFileName("../../evil.sh")).toBe(".._.._evil.sh");
    expect(sanitizeFileName("a\u0000b\nc.txt")).toBe("abc.txt");
    expect(sanitizeFileName("..")).toBe("file");
    expect(sanitizeFileName("")).toBe("file");
  });

  it("allows common document types and blocks scriptable ones", () => {
    expect(isAllowedMime("image/png")).toBe(true);
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("text/plain; charset=utf-8")).toBe(true);
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("application/x-msdownload")).toBe(false);
  });
});
