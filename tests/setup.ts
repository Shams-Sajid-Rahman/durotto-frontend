import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { resetRateLimits } from "@/lib/server/auth";
import { resetHub } from "@/lib/server/signaling-hub";

// Every test gets a fresh JSON database and uploads directory.
let dir: string | null = null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "durotto-test-"));
  process.env.DUROTTO_DB_PATH = join(dir, "db.json");
  process.env.DUROTTO_UPLOADS_DIR = join(dir, "uploads");
  delete process.env.DUROTTO_DISABLE_RATE_LIMIT;
  resetRateLimits();
  resetHub();
});

afterEach(() => {
  resetHub();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});
