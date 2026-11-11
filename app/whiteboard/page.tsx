"use client";

import { useAuth } from "@/lib/auth-context";
import { WhiteboardPanel } from "@/components/whiteboard/WhiteboardPanel";

// The standalone whiteboard is a personal, local-only canvas: no room, so no
// sync and no saved history. (Whiteboards inside a meeting room are shared.)
const NO_PARTICIPANTS: never[] = [];
const noSubscribe = () => () => {};
const noSend = () => {};

export default function WhiteboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <WhiteboardPanel
        mode="full"
        roomId="standalone"
        loadHistory={false}
        currentUserId={user.id}
        participants={NO_PARTICIPANTS}
        onSignalingMessage={noSubscribe}
        sendSignalingMessage={noSend}
      />
    </div>
  );
}
