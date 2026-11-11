import { describe, expect, it } from "vitest";
import { isPng, readPngText, writePngText } from "@/lib/png-text";

// A real 1×1 PNG.
const PIXEL = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
);

function chunkTypes(png: Uint8Array): string[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const types: string[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    types.push(Buffer.from(png.subarray(offset + 4, offset + 8)).toString("latin1"));
    offset += 12 + length;
  }
  return types;
}

describe("png text chunks", () => {
  it("round-trips a value without disturbing the image chunks", () => {
    const out = writePngText(PIXEL, "durotto-whiteboard", '{"objects":[]}');
    expect(isPng(out)).toBe(true);
    expect(readPngText(out, "durotto-whiteboard")).toBe('{"objects":[]}');
    expect(chunkTypes(out)).toEqual(["IHDR", "IDAT", "tEXt", "IEND"]);
    expect(readPngText(PIXEL, "durotto-whiteboard")).toBeNull();
  });

  it("handles unicode and large payloads", () => {
    const text = JSON.stringify({ label: "স্বাগতম — 你好 ✓", path: "x".repeat(3_000_000) });
    const out = writePngText(PIXEL, "k", text);
    expect(readPngText(out, "k")).toBe(text);
  });

  it("replaces an existing value instead of adding a second chunk", () => {
    const once = writePngText(PIXEL, "k", "first");
    const twice = writePngText(once, "k", "second");
    expect(readPngText(twice, "k")).toBe("second");
    expect(chunkTypes(twice).filter((t) => t === "tEXt")).toHaveLength(1);
  });

  it("ignores other keys and non-PNG input", () => {
    const out = writePngText(PIXEL, "other", "value");
    expect(readPngText(out, "k")).toBeNull();
    expect(readPngText(new TextEncoder().encode("not a png"), "k")).toBeNull();
    expect(() => writePngText(new Uint8Array(4), "k", "v")).toThrow();
  });
});

describe("crc32", () => {
  it("matches the PNG reference value and the stored chunk checksum", async () => {
    const { crc32 } = await import("@/lib/png-text");
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);

    const out = writePngText(PIXEL, "k", "v");
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    let offset = 8;
    while (offset + 12 <= out.length) {
      const length = view.getUint32(offset);
      const typeAndData = out.subarray(offset + 4, offset + 8 + length);
      expect(view.getUint32(offset + 8 + length)).toBe(crc32(typeAndData));
      offset += 12 + length;
    }
  });
});

describe("whiteboard files", () => {
  it("embed the editable board in the PNG and read it back", async () => {
    const { buildBoardPng, readBoardFromPng, derivedFileName } = await import("@/lib/whiteboard-file");
    const board = { version: "7.0.0", objects: [{ type: "Rect", strokeId: "s1", left: 10 }] };
    const blob = await buildBoardPng(new Blob([PIXEL], { type: "image/png" }), board);
    expect(blob.type).toBe("image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(readBoardFromPng(bytes)).toEqual(board);
    expect(readBoardFromPng(PIXEL)).toBeNull(); // ordinary image

    expect(derivedFileName("Whiteboard 2026-11-11 15-42.png", "copy")).toBe("Whiteboard 2026-11-11 15-42 (copy).png");
    expect(derivedFileName("Sketch (copy).png", "copy")).toBe("Sketch (copy).png");
    expect(derivedFileName("holiday.jpg", "edited")).toBe("holiday (edited).png");
  });
});
