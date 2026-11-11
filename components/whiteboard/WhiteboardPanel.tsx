"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { uploadFile } from "@/lib/api";
import { PresenceAvatar } from "@/components/shared/PresenceAvatar";
import { WhiteboardCanvas, type WhiteboardCanvasHandle } from "@/components/whiteboard/WhiteboardCanvas";
import { WhiteboardToolbar, type WhiteboardTool } from "@/components/whiteboard/WhiteboardToolbar";
import { WhiteboardBottomBar } from "@/components/whiteboard/WhiteboardBottomBar";
import type { Participant } from "@/lib/webrtc/usePeerConnections";
import type { SignalingMessage } from "@/lib/webrtc/signaling";
import { cn } from "@/lib/utils";

interface WhiteboardPanelProps {
  mode?: "drawer" | "full";
  roomId: string;
  currentUserId: string;
  participants: Participant[];
  /** Load the room's saved strokes (disable for a local-only board). */
  loadHistory?: boolean;
  /**
   * Room to save board images into (shared with its members), or null to
   * save to the user’s personal library.
   */
  saveRoomId?: string | null;
  onClose?: () => void;
  onSignalingMessage: (callback: (message: SignalingMessage) => void) => () => void;
  sendSignalingMessage: (message: SignalingMessage) => void;
}

const STROKE_WIDTH = 3;
const STATUS_TIMEOUT_MS = 6000;

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; fileName: string }
  | { kind: "error"; message: string };

/** "Whiteboard 2026-11-11 15-42.png" in local time. */
function boardFileName(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `Whiteboard ${day} ${pad(date.getHours())}-${pad(date.getMinutes())}.png`;
}
const MOBILE_QUERY = "(max-width: 639px)";

function subscribeToViewport(callback: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** Compact toolbars on phones; SSR/hydration render uses the desktop layout. */
function useIsMobile() {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export function WhiteboardPanel({
  mode = "drawer",
  roomId,
  currentUserId,
  participants,
  loadHistory = true,
  saveRoomId = null,
  onClose,
  onSignalingMessage,
  sendSignalingMessage,
}: WhiteboardPanelProps) {
  const [tool, setTool] = useState<WhiteboardTool>("pen");
  const [color, setColor] = useState("#111827");
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const canvasRef = useRef<WhiteboardCanvasHandle | null>(null);
  const isMobile = useIsMobile();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const showStatus = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
    clearTimeout(hideTimer.current);
    if (status.kind === "saved" || status.kind === "error") {
      hideTimer.current = setTimeout(() => setSaveStatus({ kind: "idle" }), STATUS_TIMEOUT_MS);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (saveStatus.kind === "saving") return;
    showStatus({ kind: "saving" });
    try {
      const blob = await canvasRef.current?.exportImage();
      if (!blob) {
        showStatus({ kind: "error", message: "The board is empty — draw something first." });
        return;
      }
      const fileName = boardFileName();
      await uploadFile(new File([blob], fileName, { type: "image/png" }), saveRoomId);
      showStatus({ kind: "saved", fileName });
    } catch (err) {
      showStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not save the whiteboard.",
      });
    }
  }, [saveRoomId, saveStatus.kind, showStatus]);

  const activeParticipants = useMemo(
    () => participants.filter((participant) => participant.id !== currentUserId),
    [participants, currentUserId],
  );

  const handleZoomChange = useCallback((nextZoom: number) => {
    setZoom(Math.min(2, Math.max(0.5, nextZoom)));
  }, []);

  const handleUndoRedoChange = useCallback(
    ({ canUndo: undo, canRedo: redo }: { canUndo: boolean; canRedo: boolean }) => {
      setCanUndo(undo);
      setCanRedo(redo);
    },
    [],
  );

  const title = mode === "full" ? "Whiteboard" : "Meeting whiteboard";

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-base text-text-primary",
        mode === "drawer" ? "min-h-screen" : "min-h-full",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-elevated px-4 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">{title}</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">Collaborative board</p>
        </div>

        <div className="flex items-center gap-2">
          {activeParticipants.slice(0, 4).map((participant) => (
            <PresenceAvatar key={participant.id} name={participant.name} status="online" size="sm" />
          ))}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface text-text-secondary transition hover:border-accent-start hover:text-accent-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
              aria-label="Close whiteboard"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden px-4 py-4">
        <div className="relative h-full overflow-hidden rounded-[var(--radius-lg)] border border-border-subtle bg-[#FAFAFA] shadow-sm">
          <WhiteboardToolbar activeTool={tool} onSelectTool={setTool} compact={isMobile} />

          <WhiteboardCanvas
            ref={canvasRef}
            roomId={roomId}
            currentUserId={currentUserId}
            currentTool={tool}
            strokeColor={color}
            strokeWidth={STROKE_WIDTH}
            zoom={zoom}
            loadHistory={loadHistory}
            onSignalingMessage={onSignalingMessage}
            sendSignalingMessage={sendSignalingMessage}
            onUndoRedoChange={handleUndoRedoChange}
          />

          <WhiteboardBottomBar
            color={color}
            onSelectColor={setColor}
            zoom={zoom}
            onZoomChange={handleZoomChange}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
            onSave={() => void handleSave()}
            saving={saveStatus.kind === "saving"}
            compact={isMobile}
          />

          {saveStatus.kind === "saved" || saveStatus.kind === "error" ? (
            <div
              role="status"
              className={cn(
                "absolute right-4 top-4 z-30 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm shadow-lg",
                saveStatus.kind === "saved"
                  ? "border-success/30 bg-surface-elevated text-text-primary"
                  : "border-danger/30 bg-surface-elevated text-text-primary",
              )}
            >
              {saveStatus.kind === "saved" ? (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  <span className="truncate">
                    Saved <span className="font-medium">{saveStatus.fileName}</span>
                  </span>
                  <Link
                    href="/files"
                    className="shrink-0 font-semibold text-accent-start hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start rounded-sm"
                  >
                    Open Files
                  </Link>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                  <span>{saveStatus.message}</span>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
