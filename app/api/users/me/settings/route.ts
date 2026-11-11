import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/server/db";
import { getAuthUser, readJson, unauthorized } from "@/lib/server/auth";

interface Settings {
  status: "online" | "away" | "dnd" | "offline";
  notifications: {
    meetingReminders: boolean;
    chatMessages: boolean;
    fileUploads: boolean;
    sounds: boolean;
  };
  theme: "dark" | "light" | "system";
}

const DEFAULT_SETTINGS: Settings = {
  status: "online",
  notifications: {
    meetingReminders: true,
    chatMessages: true,
    fileUploads: true,
    sounds: false,
  },
  theme: "dark",
};

const STATUSES = new Set(["online", "away", "dnd", "offline"]);
const THEMES = new Set(["dark", "light", "system"]);
const NOTIFICATION_KEYS = Object.keys(DEFAULT_SETTINGS.notifications) as Array<
  keyof Settings["notifications"]
>;

/** Merge a patch onto settings, accepting only known keys with valid values. */
function merge(current: Settings, patch: Record<string, unknown>): Settings {
  const next: Settings = { ...current, notifications: { ...current.notifications } };
  if (typeof patch.status === "string" && STATUSES.has(patch.status)) {
    next.status = patch.status as Settings["status"];
  }
  if (typeof patch.theme === "string" && THEMES.has(patch.theme)) {
    next.theme = patch.theme as Settings["theme"];
  }
  const notifications = patch.notifications;
  if (notifications && typeof notifications === "object") {
    for (const key of NOTIFICATION_KEYS) {
      const value = (notifications as Record<string, unknown>)[key];
      if (typeof value === "boolean") next.notifications[key] = value;
    }
  }
  return next;
}

function load(settingsJson: string): Settings {
  try {
    return merge(DEFAULT_SETTINGS, JSON.parse(settingsJson || "{}"));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(load(user.settingsJson));
}

export async function PATCH(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return unauthorized();

  const body = await readJson(req);
  const merged = updateDB((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) return null;
    const next = merge(load(u.settingsJson), body);
    u.settingsJson = JSON.stringify(next);
    return next;
  });

  if (!merged) return unauthorized();
  return NextResponse.json(merged);
}
