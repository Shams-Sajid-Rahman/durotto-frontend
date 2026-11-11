import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSignalingConnection,
  fetchIceServers,
  type SignalingConnection,
  type SignalingMessage,
  type SignalingState,
} from "@/lib/webrtc/signaling";

export type { SignalingState };

export type Participant = {
  id: string;
  name: string;
  avatar?: string;
};

export type PeerConnectionState = "connecting" | "connected" | "failed";

interface PeerEntry {
  pc: RTCPeerConnection;
  /** Perfect negotiation: the polite peer yields on offer collisions. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  fallbackStream: MediaStream | null;
}

/**
 * Mesh WebRTC for a room. Signaling flow:
 *  - On connect the server sends `welcome` with the peers already present.
 *  - Those peers receive `peer-joined` and each opens a connection to the
 *    newcomer (so exactly one side initiates).
 *  - Offers/answers/ICE candidates are exchanged with "perfect negotiation",
 *    which also handles renegotiation when the camera starts later.
 */
export function usePeerConnections(
  roomId: string,
  token: string,
  localUserId: string | null,
  localStream: MediaStream | null,
) {
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const [connectionStates, setConnectionStates] = useState<Map<string, PeerConnectionState>>(
    () => new Map(),
  );
  const [signalingState, setSignalingState] = useState<SignalingState>("connecting");
  const [peers, setPeers] = useState<Participant[]>([]);

  const signalingRef = useRef<SignalingConnection | null>(null);
  const peerMapRef = useRef<Map<string, PeerEntry>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const listenersRef = useRef(new Set<(message: SignalingMessage) => void>());

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!token || !roomId || !localUserId) return;
    const selfId = localUserId;
    const peerMap = peerMapRef.current;
    const listeners = listenersRef.current;
    const signaling = createSignalingConnection(roomId, token);
    signalingRef.current = signaling;
    const iceServersPromise = fetchIceServers();
    let disposed = false;
    let chain: Promise<void> = Promise.resolve();

    const setPeerState = (id: string, state: PeerConnectionState) =>
      setConnectionStates((prev) => new Map(prev).set(id, state));

    const upsertPeer = (id: string, name?: string) =>
      setPeers((prev) => {
        const existing = prev.find((p) => p.id === id);
        if (!existing) return [...prev, { id, name: name || "Guest" }];
        if (name && existing.name !== name) {
          return prev.map((p) => (p.id === id ? { ...p, name } : p));
        }
        return prev;
      });

    const closePeer = (id: string) => {
      const entry = peerMap.get(id);
      if (entry) {
        entry.pc.close();
        peerMap.delete(id);
      }
      setRemoteStreams((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setConnectionStates((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    };

    async function ensurePeer(remoteId: string, initiator: boolean): Promise<PeerEntry | null> {
      const existing = peerMap.get(remoteId);
      if (existing) return existing;
      const iceServers = await iceServersPromise;
      if (disposed) return null;

      const pc = new RTCPeerConnection({ iceServers });
      const entry: PeerEntry = {
        pc,
        polite: selfId < remoteId,
        makingOffer: false,
        ignoreOffer: false,
        pendingCandidates: [],
        fallbackStream: null,
      };
      peerMap.set(remoteId, entry);
      setPeerState(remoteId, "connecting");

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setPeerState(remoteId, "connected");
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setPeerState(remoteId, "failed");
        }
      };

      pc.ontrack = (event) => {
        let stream = event.streams?.[0];
        if (!stream) {
          entry.fallbackStream ??= new MediaStream();
          entry.fallbackStream.addTrack(event.track);
          stream = entry.fallbackStream;
        }
        const resolved = stream;
        setRemoteStreams((prev) => new Map(prev).set(remoteId, resolved));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signaling.send({
            type: "ice-candidate",
            targetUserId: remoteId,
            payload: event.candidate.toJSON(),
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            signaling.send({
              type: pc.localDescription.type === "answer" ? "answer" : "offer",
              targetUserId: remoteId,
              payload: pc.localDescription.toJSON(),
            });
          }
        } catch {
          // negotiation will be retried on the next change
        } finally {
          entry.makingOffer = false;
        }
      };

      const stream = localStreamRef.current;
      if (stream && stream.getTracks().length > 0) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } else if (initiator) {
        // No camera/mic yet: still negotiate so we receive the other side's media.
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.addTransceiver("video", { direction: "recvonly" });
      }
      return entry;
    }

    async function handleDescription(remoteId: string, description: RTCSessionDescriptionInit) {
      const entry = await ensurePeer(remoteId, false);
      if (!entry) return;
      const { pc } = entry;
      const offerCollision =
        description.type === "offer" && (entry.makingOffer || pc.signalingState !== "stable");
      entry.ignoreOffer = !entry.polite && offerCollision;
      if (entry.ignoreOffer) return;

      await pc.setRemoteDescription(description);
      for (const candidate of entry.pendingCandidates.splice(0)) {
        await pc.addIceCandidate(candidate).catch(() => {});
      }
      if (description.type === "offer") {
        await pc.setLocalDescription();
        if (pc.localDescription) {
          signaling.send({
            type: "answer",
            targetUserId: remoteId,
            payload: pc.localDescription.toJSON(),
          });
        }
      }
    }

    async function handleCandidate(remoteId: string, candidate: RTCIceCandidateInit) {
      const entry = peerMap.get(remoteId);
      if (!entry) return;
      if (!entry.pc.remoteDescription) {
        entry.pendingCandidates.push(candidate);
        return;
      }
      await entry.pc.addIceCandidate(candidate).catch(() => {
        // candidates for an ignored offer are expected to fail
      });
    }

    async function handleWebRtc(message: SignalingMessage) {
      if (disposed) return;
      const senderId = message.senderId;
      switch (message.type) {
        case "welcome": {
          // Fresh (re)connection: drop stale connections; the peers listed
          // here will each open a new one to us.
          [...peerMap.keys()].forEach(closePeer);
          const list = ((message.payload as { peers?: Participant[] })?.peers ?? []).filter(
            (p) => p.id !== selfId,
          );
          setPeers(list.map((p) => ({ id: p.id, name: p.name || "Guest" })));
          return;
        }
        case "peer-joined":
        case "peer-rejoined": {
          if (!senderId || senderId === selfId) return;
          upsertPeer(senderId, message.senderName);
          closePeer(senderId);
          await ensurePeer(senderId, true);
          return;
        }
        case "peer-left": {
          if (!senderId) return;
          closePeer(senderId);
          setPeers((prev) => prev.filter((p) => p.id !== senderId));
          return;
        }
        case "offer":
        case "answer": {
          if (!senderId || senderId === selfId) return;
          upsertPeer(senderId, message.senderName);
          await handleDescription(senderId, message.payload as RTCSessionDescriptionInit);
          return;
        }
        case "ice-candidate": {
          if (!senderId) return;
          await handleCandidate(senderId, message.payload as RTCIceCandidateInit);
          return;
        }
      }
    }

    const unsubscribe = signaling.onMessage((message) => {
      // App-level listeners (chat, whiteboard) get messages immediately…
      listeners.forEach((listener) => listener(message));
      // …while WebRTC handling runs strictly in order.
      chain = chain.then(() => handleWebRtc(message)).catch(() => {});
    });
    const unsubscribeState = signaling.onStateChange(setSignalingState);

    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeState();
      signaling.close();
      if (signalingRef.current === signaling) signalingRef.current = null;
      peerMap.forEach((entry) => entry.pc.close());
      peerMap.clear();
      setRemoteStreams(new Map());
      setConnectionStates(new Map());
      setPeers([]);
    };
  }, [roomId, token, localUserId]);

  // Camera/mic became available (or changed) after connections were made.
  useEffect(() => {
    if (!localStream) return;
    peerMapRef.current.forEach(({ pc }) => {
      localStream.getTracks().forEach((track) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
        if (sender) {
          if (sender.track !== track) void sender.replaceTrack(track).catch(() => {});
          return;
        }
        const idle = pc
          .getTransceivers()
          .find(
            (t) =>
              t.receiver.track?.kind === track.kind &&
              !t.sender.track &&
              t.currentDirection !== "stopped",
          );
        if (idle) {
          void idle.sender.replaceTrack(track).catch(() => {});
          idle.sender.setStreams?.(localStream);
          idle.direction = "sendrecv"; // triggers renegotiation
          return;
        }
        pc.addTrack(track, localStream);
      });
    });
  }, [localStream]);

  const replaceTrack = useCallback(async (newTrack: MediaStreamTrack) => {
    peerMapRef.current.forEach(({ pc }) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === newTrack.kind) {
          sender.replaceTrack(newTrack).catch(() => {
            // ignore replace failures
          });
        }
      });
    });
  }, []);

  const stopAll = useCallback(() => {
    peerMapRef.current.forEach(({ pc }) => pc.close());
    peerMapRef.current.clear();
    setRemoteStreams(new Map());
    setConnectionStates(new Map());
    signalingRef.current?.close();
  }, []);

  /** Subscribe to every signaling message (stable identity). */
  const onSignalingMessage = useCallback((callback: (message: SignalingMessage) => void) => {
    const listeners = listenersRef.current;
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, []);

  /** Send a room message (stable identity). */
  const sendSignalingMessage = useCallback((message: SignalingMessage) => {
    signalingRef.current?.send(message);
  }, []);

  return {
    remoteStreams,
    connectionStates,
    peers,
    replaceTrack,
    stopAll,
    signalingState,
    onSignalingMessage,
    sendSignalingMessage,
  };
}
