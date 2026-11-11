/**
 * Read/write a text chunk inside a PNG file.
 *
 * Saved whiteboards keep their editable contents (Fabric JSON) in a `tEXt`
 * chunk, so the file is an ordinary image everywhere else but can be reopened
 * for editing in the whiteboard. `tEXt` is Latin-1 only, so values are stored
 * as base64 of their UTF-8 bytes.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function toBase64(text: string): string {
  return btoa(latin1Decode(new TextEncoder().encode(text)));
}

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** Bytes → Latin-1 string, in slices (spreading a large array overflows the call stack). */
function latin1Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
}

interface Chunk {
  type: string;
  start: number; // offset of the length field
  dataStart: number;
  length: number;
}

function* chunks(bytes: Uint8Array): Generator<Chunk> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset + 12 + length > bytes.length) return; // truncated
    yield { type, start: offset, dataStart: offset + 8, length };
    offset += 12 + length;
  }
}

/**
 * Return a copy of the PNG with `key` set to `value` (replacing an existing
 * chunk with the same key). The chunk is inserted just before IEND.
 */
export function writePngText(png: Uint8Array, key: string, value: string): Uint8Array<ArrayBuffer> {
  if (!isPng(png)) throw new Error("Not a PNG file");
  if (!/^[\x20-\x7e]{1,79}$/.test(key)) throw new Error("Invalid PNG text key");

  const keep: Uint8Array[] = [png.subarray(0, 8)];
  let iend: Uint8Array | null = null;
  for (const chunk of chunks(png)) {
    const raw = png.subarray(chunk.start, chunk.dataStart + chunk.length + 4);
    if (chunk.type === "IEND") {
      iend = raw;
      break;
    }
    if (chunk.type === "tEXt" && readKey(png, chunk) === key) continue; // replaced below
    keep.push(raw);
  }
  if (!iend) throw new Error("PNG has no IEND chunk");

  const keyBytes = latin1(key);
  const valueBytes = latin1(toBase64(value));
  const data = new Uint8Array(keyBytes.length + 1 + valueBytes.length);
  data.set(keyBytes, 0);
  data.set(valueBytes, keyBytes.length + 1); // keyword, NUL separator, text
  const typeAndData = new Uint8Array(4 + data.length);
  typeAndData.set(latin1("tEXt"), 0);
  typeAndData.set(data, 4);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeAndData, 4);
  view.setUint32(8 + data.length, crc32(typeAndData));

  const parts = [...keep, chunk, iend];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readKey(png: Uint8Array, chunk: Chunk): string {
  const data = png.subarray(chunk.dataStart, chunk.dataStart + chunk.length);
  const nul = data.indexOf(0);
  return nul === -1 ? "" : latin1Decode(data.subarray(0, nul));
}

/** The value stored under `key`, or null if the PNG has none (or isn't a PNG). */
export function readPngText(png: Uint8Array, key: string): string | null {
  if (!isPng(png)) return null;
  for (const chunk of chunks(png)) {
    if (chunk.type === "IEND") break;
    if (chunk.type !== "tEXt" || readKey(png, chunk) !== key) continue;
    const data = png.subarray(chunk.dataStart, chunk.dataStart + chunk.length);
    const b64 = latin1Decode(data.subarray(data.indexOf(0) + 1));
    try {
      return fromBase64(b64);
    } catch {
      return null;
    }
  }
  return null;
}
