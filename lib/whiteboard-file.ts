import { readPngText, writePngText } from "@/lib/png-text";

/** PNG text key holding the editable board (Fabric JSON). */
const BOARD_KEY = "durotto-whiteboard";

/** A file the whiteboard is currently editing. */
export interface WhiteboardFileRef {
  id: string;
  name: string;
  /** Save may overwrite it (you own it and it is a saved board). */
  canOverwrite: boolean;
}

/** Image + editable board in one PNG: shows as a picture, reopens for editing. */
export async function buildBoardPng(image: Blob, board: Record<string, unknown>): Promise<Blob> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  const withBoard = writePngText(bytes, BOARD_KEY, JSON.stringify({ version: 1, board }));
  return new Blob([withBoard], { type: "image/png" });
}

/** The editable board stored in a saved PNG, or null for an ordinary image. */
export function readBoardFromPng(bytes: Uint8Array): Record<string, unknown> | null {
  const raw = readPngText(bytes, BOARD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number; board?: unknown };
    return parsed?.board && typeof parsed.board === "object"
      ? (parsed.board as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** "Whiteboard 2026-11-11 15-42.png" in local time. */
export function boardFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `Whiteboard ${day} ${pad(date.getHours())}-${pad(date.getMinutes())}.png`;
}

/** "Sketch.png" → "Sketch (copy).png"; "photo.jpg" → "photo (edited).png". */
export function derivedFileName(name: string, suffix: "copy" | "edited"): string {
  const base = name.replace(/\.[^./\\]+$/, "").replace(/ \((copy|edited)\)$/, "");
  return `${base} (${suffix}).png`;
}
