"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";

import {
  ApiError,
  files,
  rooms,
  uploadFile,
  type Room,
  type RoomFile,
  type RoomMessage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { usePeerConnections, type Participant } from "@/lib/webrtc/usePeerConnections";
import { CallControlBar } from "@/components/meeting/CallControlBar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ParticipantsPanel } from "@/components/meeting/ParticipantsPanel";
import { RoomHeader } from "@/components/meeting/RoomHeader";
import { SidePanel } from "@/components/meeting/SidePanel";
import { VideoGrid } from "@/components/meeting/VideoGrid";
import { WhiteboardPanel } from "@/components/whiteboard/WhiteboardPanel";

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4 text-center">
      <div className="rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-8">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-accent-start" />
        <p className="text-sm text-text-secondary">{message}</p>
      </div>
    </div>
  );
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function describeMediaError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unable to access your camera and microphone.";
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || /permission|denied/i.test(message)
    ? "Camera and microphone permission denied. Please allow access and retry."
    : message;
}

type ChatPayload = {
  text?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
};

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  // Next.js 16: route params are a Promise.
  const { roomId } = use(params);
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<"chat" | "participants" | "whiteboard" | null>(null);
  const [chatTab, setChatTab] = useState<"messages" | "files">("messages");
  const [chatMessages, setChatMessages] = useState<RoomMessage[]>([]);
  const [chatFiles, setChatFiles] = useState<RoomFile[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  // Latest streams for unmount cleanup (effects must not re-run on change).
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const openPanelRef = useRef(openPanel);

  useEffect(() => {
    localStreamRef.current = localStream;
    screenStreamRef.current = screenShareStream;
    openPanelRef.current = openPanel;
  }, [localStream, screenShareStream, openPanel]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const applyLocalStream = useCallback((stream: MediaStream) => {
    stopStream(localStreamRef.current);
    setMediaError(null);
    setLocalStream(stream);
    setIsMicOn(true);
    setIsCameraOn(true);
  }, []);

  const requestLocalMedia = useCallback(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then(applyLocalStream)
      .catch((error) => setMediaError(describeMediaError(error)));
  }, [applyLocalStream]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        // Unmounted meanwhile (or StrictMode's double mount): release it.
        if (cancelled) stopStream(stream);
        else applyLocalStream(stream);
      })
      .catch((error) => {
        if (!cancelled) setMediaError(describeMediaError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [applyLocalStream, isAuthenticated]);

  // Load room details and chat history.
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let active = true;

    rooms
      .get(roomId)
      .then(async (roomData) => {
        if (!active) return;
        setRoom(roomData);
        setRoomError(null);
        const [history, roomFiles] = await Promise.all([
          rooms.messages(roomId).catch(() => [] as RoomMessage[]),
          rooms.files(roomId).catch(() => [] as RoomFile[]),
        ]);
        if (!active) return;
        setChatMessages(history);
        setChatFiles(roomFiles);
      })
      .catch((error) => {
        if (!active) return;
        const status = error instanceof ApiError ? error.status : undefined;
        setRoomError(
          status === 403 || status === 404
            ? "Room not found, or you haven't joined it yet. Ask the host for the join code."
            : "Unable to load room details. Please try again.",
        );
      })
      .finally(() => {
        if (active) setRoomLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated, token, roomId]);

  const {
    remoteStreams,
    connectionStates,
    peers,
    replaceTrack,
    stopAll,
    signalingState,
    onSignalingMessage,
    sendSignalingMessage,
  } = usePeerConnections(room ? roomId : "", token ?? "", user?.id ?? null, localStream);

  const participants = useMemo<Participant[]>(
    () => (user ? [{ id: user.id, name: user.name }, ...peers] : peers),
    [user, peers],
  );

  // Live chat messages from other participants.
  useEffect(() => {
    if (!user) return;
    return onSignalingMessage((message) => {
      if (message.type !== "chat-message" || message.senderId === user.id) return;
      const payload = (message.payload ?? {}) as ChatPayload;
      const senderName = message.senderName ?? "Guest";

      setChatMessages((current) => [
        ...current,
        {
          id: `remote-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          senderId: message.senderId ?? "unknown",
          senderName,
          payload: {
            text: payload.text,
            fileId: payload.fileId,
            fileName: payload.fileName,
            fileSize: payload.fileSize,
            fileType: payload.fileType,
          },
          sentAt: new Date().toISOString(),
        },
      ]);
      if (openPanelRef.current !== "chat") setChatUnreadCount((n) => n + 1);

      if (payload.fileId && payload.fileName && payload.fileSize != null) {
        const incoming: RoomFile = {
          id: payload.fileId,
          name: payload.fileName,
          size: payload.fileSize,
          mimeType: payload.fileType ?? "application/octet-stream",
          uploaderId: message.senderId ?? "unknown",
          uploaderName: senderName,
          uploadedAt: new Date().toISOString(),
        };
        setChatFiles((current) =>
          current.some((f) => f.id === incoming.id) ? current : [incoming, ...current],
        );
      }
    });
  }, [onSignalingMessage, user]);

  const postChatMessage = useCallback(
    (payload: ChatPayload) => {
      if (!user) return;
      sendSignalingMessage({ type: "chat-message", payload });
      setChatMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          senderId: user.id,
          senderName: user.name,
          payload,
          sentAt: new Date().toISOString(),
        },
      ]);
    },
    [sendSignalingMessage, user],
  );

  const handleAttachFile = useCallback(
    async (file: File) => {
      if (!user) return;
      setChatError(null);
      setUploadingFileName(file.name);
      setUploadProgress(0);
      setChatLoading(true);
      try {
        const confirmed = await uploadFile(file, roomId, setUploadProgress);
        setChatFiles((current) => [confirmed, ...current.filter((f) => f.id !== confirmed.id)]);
        postChatMessage({
          fileId: confirmed.id,
          fileName: confirmed.name,
          fileSize: confirmed.size,
          fileType: confirmed.mimeType,
        });
      } catch (error) {
        setChatError(
          error instanceof Error ? error.message : "Unable to upload the file. Please try again.",
        );
      } finally {
        setUploadingFileName(null);
        setUploadProgress(null);
        setChatLoading(false);
      }
    },
    [roomId, postChatMessage, user],
  );

  const handleSendMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    postChatMessage({ text });
    setChatInput("");
  }, [chatInput, postChatMessage]);

  const handleDownloadFile = useCallback(async (file: RoomFile) => {
    setChatError(null);
    try {
      const blob = await files.download(file.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Unable to download the file. Please try again.",
      );
    }
  }, []);

  const handleToggleChat = useCallback(() => {
    setOpenPanel((current) => (current === "chat" ? null : "chat"));
    setChatUnreadCount(0);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Release camera/mic and close connections only when leaving the page.
  useEffect(() => {
    return () => {
      stopAll();
      stopStream(localStreamRef.current);
      stopStream(screenStreamRef.current);
    };
  }, [stopAll]);

  const handleToggleMic = () => {
    const next = !isMicOn;
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsMicOn(next);
  };

  const handleToggleCamera = () => {
    const next = !isCameraOn;
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsCameraOn(next);
  };

  const stopScreenShare = useCallback(() => {
    stopStream(screenStreamRef.current);
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) void replaceTrack(cameraTrack);
    setScreenShareStream(null);
  }, [replaceTrack]);

  const handleToggleScreenShare = async () => {
    if (screenShareStream) {
      stopScreenShare();
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) {
        stopStream(displayStream);
        setMediaError("Unable to start screen sharing.");
        return;
      }
      displayTrack.onended = () => stopScreenShare();
      await replaceTrack(displayTrack);
      setScreenShareStream(displayStream);
    } catch (error) {
      // Cancelling the browser's picker is not an error worth showing.
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      setMediaError(error instanceof Error ? error.message : "Unable to start screen sharing.");
    }
  };

  const handleLeave = () => {
    if (!window.confirm("Leave the meeting and return to dashboard?")) return;
    router.push("/dashboard");
  };

  const isScreenSharing = !!screenShareStream;
  const localStreamForGrid = screenShareStream ?? localStream;
  const participantCount = participants.length;
  const roomTitle = room?.name ?? "Meeting room";

  if (isLoading || !user) {
    return <LoadingScreen message="Checking authentication…" />;
  }

  if (roomLoading) {
    return <LoadingScreen message="Loading meeting room…" />;
  }

  if (roomError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base px-4 text-center">
        <div className="rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-8">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-danger" />
          <p className="text-sm text-text-primary">{roomError}</p>
          <button
            type="button"
            onClick={() => router.replace("/dashboard")}
            className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-accent-gradient px-4 py-2 text-sm font-semibold text-black"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base text-text-primary">
      <div className="mx-auto max-w-[1600px] px-4 pb-40 pt-4 md:px-6">
        <RoomHeader
          title={roomTitle}
          elapsedTime={formatElapsed(elapsedSeconds)}
          participantCount={participantCount}
          joinCode={room?.join_code}
          onOpenParticipants={() => setOpenPanel("participants")}
          isCollapsed={headerCollapsed}
          onToggleCollapse={() => setHeaderCollapsed((current) => !current)}
        />

        {mediaError && (
          <div className="my-4 rounded-[var(--radius-xl)] border border-danger/30 bg-[#EF444428] p-4 text-sm text-text-primary">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{mediaError}</p>
              <button
                type="button"
                onClick={() => {
                  setMediaError(null);
                  requestLocalMedia();
                }}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-surface-elevated px-3 py-2 text-sm font-semibold text-text-primary border border-border-subtle hover:border-accent-start"
              >
                <RefreshCcw className="w-4 h-4" />
                Retry permissions
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text-secondary">Connection status</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">
                  {signalingState === "connecting" && "Connecting to peers…"}
                  {signalingState === "open" && "Connected"}
                  {signalingState === "closed" && "Connection closed — reconnecting…"}
                  {signalingState === "error" && "Unable to connect to this room"}
                </p>
              </div>
              <div className="rounded-full bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
                {participantCount} participant{participantCount === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <VideoGrid
            localStream={localStreamForGrid}
            isLocalCameraOff={!isCameraOn && !isScreenSharing}
            localUserId={user.id}
            localMuted={!isMicOn}
            remoteStreams={remoteStreams}
            participants={participants}
            connectionStates={connectionStates}
            screenShareUserId={isScreenSharing ? user.id : undefined}
          />
        </div>
      </div>

      <CallControlBar
        micOn={isMicOn}
        cameraOn={isCameraOn}
        screenSharing={isScreenSharing}
        chatUnreadCount={chatUnreadCount}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleChat={handleToggleChat}
        onToggleWhiteboard={() =>
          setOpenPanel((current) => (current === "whiteboard" ? null : "whiteboard"))
        }
        onToggleParticipants={() =>
          setOpenPanel((current) => (current === "participants" ? null : "participants"))
        }
        onLeave={handleLeave}
      />

      <SidePanel title="Participants" open={openPanel === "participants"} onClose={() => setOpenPanel(null)}>
        <ParticipantsPanel participants={participants} />
      </SidePanel>
      <SidePanel title="Chat" open={openPanel === "chat"} onClose={() => setOpenPanel(null)}>
        <ChatPanel
          currentUserId={user.id}
          value={chatInput}
          onChange={setChatInput}
          messages={chatMessages}
          files={chatFiles}
          activeTab={chatTab}
          onTabChange={setChatTab}
          onSendMessage={handleSendMessage}
          onAttachFile={handleAttachFile}
          onDownloadFile={handleDownloadFile}
          uploadingFileName={uploadingFileName}
          uploadProgress={uploadProgress}
          reconnecting={signalingState !== "open"}
          disabled={chatLoading}
          error={chatError}
        />
      </SidePanel>
      <SidePanel title="Whiteboard" open={openPanel === "whiteboard"} onClose={() => setOpenPanel(null)}>
        <WhiteboardPanel
          roomId={roomId}
          currentUserId={user.id}
          participants={participants}
          onClose={() => setOpenPanel(null)}
          onSignalingMessage={onSignalingMessage}
          sendSignalingMessage={sendSignalingMessage}
        />
      </SidePanel>
    </div>
  );
}
