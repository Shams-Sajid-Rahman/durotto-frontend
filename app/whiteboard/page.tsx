"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { files } from "@/lib/api";
import { readBoardFromPng, type WhiteboardFileRef } from "@/lib/whiteboard-file";
import { WhiteboardPanel } from "@/components/whiteboard/WhiteboardPanel";
import type { WhiteboardInitialContent } from "@/components/whiteboard/WhiteboardCanvas";

// The standalone whiteboard is a personal canvas: no room, so no live sync.
// Boards are kept by saving them to Files; `/whiteboard?file=<id>` reopens one.
const NO_PARTICIPANTS: never[] = [];
const noSubscribe = () => () => {};
const noSend = () => {};

type OpenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: WhiteboardInitialContent; file: WhiteboardFileRef | null };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

function Board({ fileId }: { fileId: string | null }) {
  const { user } = useAuth();
  const [state, setState] = useState<OpenState>(
    fileId ? { status: "loading" } : { status: "ready", content: null, file: null },
  );

  useEffect(() => {
    if (!fileId || !user) return;
    let active = true;

    (async () => {
      const meta = (await files.list()).find((f) => f.id === fileId);
      if (!meta) throw new Error("This file no longer exists, or you don't have access to it.");
      if (!meta.mimeType.startsWith("image/")) {
        throw new Error("Only images can be opened in the whiteboard.");
      }
      const blob = await files.download(fileId);
      const board = readBoardFromPng(new Uint8Array(await blob.arrayBuffer()));
      const content: WhiteboardInitialContent = board
        ? { kind: "document", data: board }
        : { kind: "image", dataUrl: await blobToDataUrl(blob) };
      return {
        content,
        file: {
          id: meta.id,
          name: meta.name,
          // Overwrite only your own saved boards; photos and other people's
          // files are saved as a new copy instead.
          canOverwrite: !!board && meta.uploaderId === user.id && meta.mimeType === "image/png",
        },
      };
    })()
      .then((opened) => {
        if (active) setState({ status: "ready", ...opened });
      })
      .catch((err) => {
        if (active) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Could not open this file.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [fileId, user]);

  if (!user) return null;

  if (state.status === "loading") {
    return (
      <div className="flex h-[calc(100vh-60px)] items-center justify-center gap-2 text-sm text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin text-accent-start" /> Opening file…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-[calc(100vh-60px)] flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-danger" />
        <p className="text-sm text-text-primary">{state.message}</p>
        <div className="flex gap-2">
          <Link
            href="/files"
            className="rounded-[var(--radius-md)] border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:border-accent-start"
          >
            Back to Files
          </Link>
          <Link
            href="/whiteboard"
            className="rounded-[var(--radius-md)] bg-accent-gradient px-4 py-2 text-sm font-semibold text-white"
          >
            New board
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <WhiteboardPanel
        mode="full"
        roomId="standalone"
        loadHistory={false}
        initialContent={state.content}
        openedFile={state.file}
        currentUserId={user.id}
        participants={NO_PARTICIPANTS}
        onSignalingMessage={noSubscribe}
        sendSignalingMessage={noSend}
      />
    </div>
  );
}

function BoardFromQuery() {
  const fileId = useSearchParams().get("file");
  // Remount per file so each opened file (or a new board) starts fresh.
  return <Board key={fileId ?? "new"} fileId={fileId} />;
}

export default function WhiteboardPage() {
  // useSearchParams needs a Suspense boundary on statically rendered pages.
  return (
    <Suspense fallback={null}>
      <BoardFromQuery />
    </Suspense>
  );
}
