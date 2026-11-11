import { getApiBase } from "@/lib/api";

export type SignalingMessage = {
  type: string;
  targetUserId?: string;
  payload?: unknown;
  /** Stamped by the server — never trusted from clients. */
  senderId?: string;
  senderName?: string;
};

export type SignalingState = "connecting" | "open" | "closed" | "error";

export interface SignalingConnection {
  send: (message: SignalingMessage) => void;
  onMessage: (callback: (message: SignalingMessage) => void) => () => void;
  onStateChange: (callback: (state: SignalingState) => void) => () => void;
  getState: () => SignalingState;
  close: () => void;
}

const ICE_SERVERS_ENDPOINT = process.env.NEXT_PUBLIC_ICE_SERVERS_ENDPOINT;
const MAX_QUEUE = 200;
const STREAM_IDLE_TIMEOUT_MS = 45_000; // server pings every 15s

/**
 * "http"  → Server-Sent Events + POST against the Next.js API (default).
 * "websocket" → the FastAPI backend's /ws hub.
 * Defaults to websocket only when NEXT_PUBLIC_API_URL is an absolute URL
 * (i.e. the separate FastAPI backend is in use).
 */
export function signalingMode(apiBase = getApiBase()): "http" | "websocket" {
  const explicit = process.env.NEXT_PUBLIC_SIGNALING;
  if (explicit === "http" || explicit === "websocket") return explicit;
  return /^https?:\/\//i.test(apiBase) ? "websocket" : "http";
}

/** Parse complete SSE events out of `buffer`; returns the unparsed remainder. */
export function parseSseChunk(
  buffer: string,
  onData: (data: string) => void,
): string {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const events = normalized.split("\n\n");
  const rest = events.pop() ?? "";
  for (const block of events) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data) onData(data);
  }
  return rest;
}

/** Listener/state/queue plumbing shared by both transports. */
function createBase() {
  let state: SignalingState = "connecting";
  const listeners = new Set<(message: SignalingMessage) => void>();
  const stateListeners = new Set<(state: SignalingState) => void>();
  const queue: SignalingMessage[] = [];

  return {
    queue,
    getState: () => state,
    setState(next: SignalingState) {
      if (state === next) return;
      state = next;
      stateListeners.forEach((listener) => listener(next));
    },
    dispatch(message: SignalingMessage) {
      listeners.forEach((listener) => listener(message));
    },
    enqueue(message: SignalingMessage) {
      if (queue.length >= MAX_QUEUE) queue.shift();
      queue.push(message);
    },
    onMessage(callback: (message: SignalingMessage) => void) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    onStateChange(callback: (state: SignalingState) => void) {
      stateListeners.add(callback);
      callback(state);
      return () => {
        stateListeners.delete(callback);
      };
    },
  };
}

function backoffMs(attempt: number) {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

// ── HTTP (SSE + POST) transport ────────────────────────────────────────────────

function createHttpConnection(roomId: string, token: string, apiBase: string): SignalingConnection {
  const base = createBase();
  const url = `${apiBase}/rooms/${encodeURIComponent(roomId)}/signal`;
  let abort: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let attempt = 0;
  let postChain: Promise<unknown> = Promise.resolve();

  const post = (message: SignalingMessage) => {
    // Serialise POSTs so the server relays them in order (an ICE candidate
    // must never overtake the offer it belongs to).
    postChain = postChain
      .then(() =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(message),
        }),
      )
      .catch(() => {
        // dropped; WebRTC retries / the user can resend
      });
  };

  const scheduleReconnect = () => {
    if (closed) return;
    base.setState("closed");
    reconnectTimer = setTimeout(connect, backoffMs(attempt));
  };

  async function connect() {
    if (closed) return;
    attempt += 1;
    base.setState("connecting");
    const controller = new AbortController();
    abort = controller;
    let lastActivity = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > STREAM_IDLE_TIMEOUT_MS) controller.abort();
    }, 5_000);

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        closed = true; // not retryable: not signed in / not a member
        base.setState("error");
        return;
      }
      if (!res.ok || !res.body) throw new Error(`signal stream ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        lastActivity = Date.now();
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseChunk(buffer, (data) => {
          let message: SignalingMessage;
          try {
            message = JSON.parse(data) as SignalingMessage;
          } catch {
            return;
          }
          if (message.type === "welcome") {
            attempt = 0;
            base.setState("open");
            while (base.queue.length > 0) post(base.queue.shift()!);
          }
          if (message.type === "session-replaced") {
            // This room was opened in another tab; don't fight over it.
            closed = true;
          }
          base.dispatch(message);
        });
      }
    } catch {
      // network drop or watchdog abort — fall through to reconnect
    } finally {
      clearInterval(watchdog);
    }
    if (closed) {
      if (base.getState() !== "error") base.setState("closed");
      return;
    }
    scheduleReconnect();
  }

  void connect();

  return {
    send(message) {
      if (base.getState() === "open") post(message);
      else base.enqueue(message);
    },
    onMessage: base.onMessage,
    onStateChange: base.onStateChange,
    getState: base.getState,
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      abort?.abort();
      base.setState("closed");
    },
  };
}

// ── WebSocket transport (FastAPI backend) ──────────────────────────────────────

/** Close codes from the FastAPI hub that mean "don't retry". */
const FATAL_WS_CODES = new Set([4001, 4003, 4004]);

function createWebSocketConnection(roomId: string, token: string, apiBase: string): SignalingConnection {
  const base = createBase();
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let attempt = 0;

  // Exchange the long-lived JWT for a single-use, short-lived ticket so the
  // credential that ends up in the WebSocket URL (and server logs) is useless.
  async function fetchTicket(): Promise<string | null> {
    const res = await fetch(`${apiBase}/ws/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId }),
    });
    if (res.status === 401 || res.status === 403 || res.status === 404) return null;
    if (!res.ok) throw new Error(`ticket ${res.status}`);
    const body = (await res.json()) as { ticket?: string };
    return body.ticket ?? null;
  }

  const scheduleReconnect = () => {
    if (closed) return;
    base.setState("closed");
    reconnectTimer = setTimeout(connect, backoffMs(attempt));
  };

  async function connect() {
    if (closed) return;
    attempt += 1;
    base.setState("connecting");
    let ticket: string | null;
    try {
      ticket = await fetchTicket();
    } catch {
      scheduleReconnect();
      return;
    }
    if (closed) return;
    if (!ticket) {
      closed = true;
      base.setState("error");
      return;
    }

    const wsBase = apiBase.replace(/^http/i, "ws");
    const ws = new WebSocket(
      `${wsBase}/ws/${encodeURIComponent(roomId)}?ticket=${encodeURIComponent(ticket)}`,
    );
    socket = ws;

    ws.addEventListener("message", (event) => {
      let message: SignalingMessage;
      try {
        message = JSON.parse(String(event.data)) as SignalingMessage;
      } catch {
        return;
      }
      if (message.type === "welcome") {
        attempt = 0;
        base.setState("open");
        while (ws.readyState === WebSocket.OPEN && base.queue.length > 0) {
          ws.send(JSON.stringify(base.queue.shift()));
        }
      }
      if (message.type === "session-replaced") closed = true;
      base.dispatch(message);
    });
    ws.addEventListener("close", (event) => {
      if (socket !== ws) return;
      socket = null;
      if (FATAL_WS_CODES.has(event.code)) {
        closed = true;
        base.setState("error");
        return;
      }
      if (closed) {
        base.setState("closed");
        return;
      }
      scheduleReconnect();
    });
    ws.addEventListener("error", () => ws.close());
  }

  void connect();

  return {
    send(message) {
      if (socket && socket.readyState === WebSocket.OPEN && base.getState() === "open") {
        socket.send(JSON.stringify(message));
      } else {
        base.enqueue(message);
      }
    },
    onMessage: base.onMessage,
    onStateChange: base.onStateChange,
    getState: base.getState,
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = socket;
      socket = null;
      ws?.close();
      base.setState("closed");
    },
  };
}

export function createSignalingConnection(roomId: string, token: string): SignalingConnection {
  const apiBase = getApiBase();
  return signalingMode(apiBase) === "websocket"
    ? createWebSocketConnection(roomId, token, apiBase)
    : createHttpConnection(roomId, token, apiBase);
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (ICE_SERVERS_ENDPOINT) {
    try {
      const res = await fetch(ICE_SERVERS_ENDPOINT, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { iceServers?: RTCIceServer[] };
        if (data?.iceServers?.length) {
          return data.iceServers;
        }
      }
    } catch {
      // fallback to built-in STUN only
    }
  }

  return [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:stun1.l.google.com:19302"] },
  ];
}
