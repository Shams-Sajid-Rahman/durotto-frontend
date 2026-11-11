import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET as listFiles } from "@/app/api/files/route";
import { GET as usage } from "@/app/api/files/usage/route";
import { POST as presign } from "@/app/api/files/presign/route";
import { POST as confirm } from "@/app/api/files/confirm/route";
import { PUT as upload } from "@/app/api/files/[id]/upload/route";
import { DELETE as softDelete, PATCH as rename } from "@/app/api/files/[id]/route";
import { POST as restore } from "@/app/api/files/[id]/restore/route";
import { DELETE as deleteForever } from "@/app/api/files/[id]/delete/route";
import { DELETE as unfavorite, POST as favorite } from "@/app/api/files/[id]/favorite/route";
import { GET as download } from "@/app/api/files/[id]/download/route";
import { GET as roomFiles } from "@/app/api/rooms/[roomId]/files/route";
import { storedFilePath } from "@/lib/server/storage";
import { createRoom, ctx, joinRoom, registerUser, req } from "../helpers";

const CONTENT = new TextEncoder().encode("hello, durotto");

async function presignFile(token: string, opts: { roomId?: string; name?: string; type?: string; size?: number } = {}) {
  return presign(
    req("POST", "/api/files/presign", {
      token,
      body: {
        fileName: opts.name ?? "notes.txt",
        fileType: opts.type ?? "text/plain",
        fileSize: opts.size ?? CONTENT.byteLength,
        roomId: opts.roomId ?? "",
      },
    }),
  );
}

/** presign → PUT bytes → confirm; returns the confirmed file. */
async function uploadText(token: string, roomId?: string) {
  const p = await presignFile(token, { roomId });
  expect(p.status).toBe(201);
  const { fileId, uploadUrl } = (await p.json()) as { fileId: string; uploadUrl: string };
  expect(uploadUrl).toMatch(new RegExp(`^/api/files/${fileId}/upload\\?token=`));

  const put = await upload(req("PUT", uploadUrl, { rawBody: CONTENT }), ctx({ id: fileId }));
  expect(put.status).toBe(200);

  const c = await confirm(req("POST", "/api/files/confirm", { token, body: { fileId, roomId: roomId ?? "" } }));
  expect(c.status).toBe(200);
  return (await c.json()) as { id: string; name: string; size: number; isFavorite: boolean; uploadUrl?: string };
}

describe("file upload flow", () => {
  it("stores the bytes and lists the file", async () => {
    const alice = await registerUser("Alice");
    const file = await uploadText(alice.token);
    expect(file.size).toBe(CONTENT.byteLength);
    expect(existsSync(storedFilePath(file.id))).toBe(true);

    const list = await (await listFiles(req("GET", "/api/files", { token: alice.token }))).json();
    expect(list.map((f: { id: string }) => f.id)).toEqual([file.id]);

    const u = await (await usage(req("GET", "/api/files/usage", { token: alice.token }))).json();
    expect(u.totalBytes).toBe(CONTENT.byteLength);
  });

  it("serves downloads as attachments", async () => {
    const alice = await registerUser();
    const file = await uploadText(alice.token);
    const res = await download(req("GET", "/x", { token: alice.token }), ctx({ id: file.id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(CONTENT);
  });

  it("rejects disallowed types and oversized files at presign", async () => {
    const alice = await registerUser();
    expect((await presignFile(alice.token, { type: "text/html" })).status).toBe(415);
    expect((await presignFile(alice.token, { size: 101 * 1024 * 1024 })).status).toBe(413);
  });

  it("protects the upload URL", async () => {
    const alice = await registerUser();
    const { fileId, uploadUrl } = await (await presignFile(alice.token)).json();

    const noToken = await upload(req("PUT", `/api/files/${fileId}/upload`, { rawBody: CONTENT }), ctx({ id: fileId }));
    expect(noToken.status).toBe(403);

    const tooBig = await upload(
      req("PUT", uploadUrl, { rawBody: new Uint8Array(CONTENT.byteLength + 10) }),
      ctx({ id: fileId }),
    );
    expect(tooBig.status).toBe(413);

    expect((await upload(req("PUT", uploadUrl, { rawBody: CONTENT }), ctx({ id: fileId }))).status).toBe(200);
    // single use: can't overwrite after upload
    expect((await upload(req("PUT", uploadUrl, { rawBody: CONTENT }), ctx({ id: fileId }))).status).toBe(409);
  });

  it("won't confirm before the bytes arrive", async () => {
    const alice = await registerUser();
    const { fileId } = await (await presignFile(alice.token)).json();
    const res = await confirm(req("POST", "/api/files/confirm", { token: alice.token, body: { fileId } }));
    expect(res.status).toBe(409);
  });
});

describe("file access control", () => {
  it("shares room files with members only", async () => {
    const host = await registerUser("Host");
    const member = await registerUser("Member");
    const outsider = await registerUser("Outsider");
    const room = await createRoom(host.token);
    await joinRoom(member.token, room.join_code);

    const file = await uploadText(host.token, room.id);

    const memberRoomFiles = await (await roomFiles(req("GET", "/x", { token: member.token }), ctx({ roomId: room.id }))).json();
    expect(memberRoomFiles.map((f: { id: string }) => f.id)).toEqual([file.id]);
    expect((await download(req("GET", "/x", { token: member.token }), ctx({ id: file.id }))).status).toBe(200);

    expect((await download(req("GET", "/x", { token: outsider.token }), ctx({ id: file.id }))).status).toBe(404);
    const outsiderList = await (await listFiles(req("GET", "/api/files", { token: outsider.token }))).json();
    expect(outsiderList).toEqual([]);

    // members can view but not delete someone else's file
    expect((await softDelete(req("DELETE", "/x", { token: member.token }), ctx({ id: file.id }))).status).toBe(403);
  });

  it("can't presign into a room you're not in", async () => {
    const host = await registerUser();
    const outsider = await registerUser();
    const room = await createRoom(host.token);
    expect((await presignFile(outsider.token, { roomId: room.id })).status).toBe(404);
  });

  it("keeps favorites per user", async () => {
    const host = await registerUser();
    const member = await registerUser();
    const room = await createRoom(host.token);
    await joinRoom(member.token, room.join_code);
    const file = await uploadText(host.token, room.id);

    expect((await favorite(req("POST", "/x", { token: member.token }), ctx({ id: file.id }))).status).toBe(200);
    const memberView = await (await listFiles(req("GET", "/api/files", { token: member.token }))).json();
    const hostView = await (await listFiles(req("GET", "/api/files", { token: host.token }))).json();
    expect(memberView[0].isFavorite).toBe(true);
    expect(hostView[0].isFavorite).toBe(false);

    await unfavorite(req("DELETE", "/x", { token: member.token }), ctx({ id: file.id }));
    const after = await (await listFiles(req("GET", "/api/files", { token: member.token }))).json();
    expect(after[0].isFavorite).toBe(false);
  });
});

describe("rename, trash and permanent delete", () => {
  it("runs the full lifecycle", async () => {
    const alice = await registerUser();
    const file = await uploadText(alice.token);
    const at = (method: string) => req(method, "/x", { token: alice.token });

    const renamed = await rename(
      req("PATCH", "/x", { token: alice.token, body: { name: "../plan.txt" } }),
      ctx({ id: file.id }),
    );
    expect((await renamed.json()).name).toBe(".._plan.txt");

    expect((await restore(at("POST"), ctx({ id: file.id }))).status).toBe(409); // not in trash
    expect((await softDelete(at("DELETE"), ctx({ id: file.id }))).status).toBe(200);
    let list = await (await listFiles(req("GET", "/api/files", { token: alice.token }))).json();
    expect(list[0].deletedAt).toBeTruthy();

    expect((await restore(at("POST"), ctx({ id: file.id }))).status).toBe(200);
    list = await (await listFiles(req("GET", "/api/files", { token: alice.token }))).json();
    expect(list[0].deletedAt).toBeNull();

    expect((await deleteForever(at("DELETE"), ctx({ id: file.id }))).status).toBe(200);
    expect(existsSync(storedFilePath(file.id))).toBe(false);
    list = await (await listFiles(req("GET", "/api/files", { token: alice.token }))).json();
    expect(list).toEqual([]);
  });
});
