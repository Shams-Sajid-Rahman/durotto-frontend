"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Search,
  Send,
  ChevronLeft,
  MessageSquare,
  Paperclip,
  MoreVertical,
  Phone,
  Video,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  initials: string;
  color: string;
  status: "online" | "away" | "offline";
}

interface DmMessage {
  id: string;
  senderId: string;
  text: string;
  sentAt: string; // ISO
}

interface Conversation {
  id: string;
  contact: Contact;
  messages: DmMessage[];
  unread: number;
}

// ── Sample data (direct messages are a UI preview; no DM backend yet) ──────────────────────────────────────────────────────────────────

const CONTACTS: Contact[] = [
  { id: "c1", name: "Alex Rivera", initials: "AR", color: "#7C5CFF", status: "online" },
  { id: "c2", name: "Jordan Kim", initials: "JK", color: "#2ECFB1", status: "online" },
  { id: "c3", name: "Sam Chen",   initials: "SC", color: "#FF6B6B", status: "away" },
  { id: "c4", name: "Morgan Lee", initials: "ML", color: "#FFB547", status: "offline" },
];

const NOW = new Date();
function dAgo(h: number) { return new Date(NOW.getTime() - h * 3_600_000).toISOString(); }

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "cv1", contact: CONTACTS[0], unread: 2,
    messages: [
      { id: "m1", senderId: "c1", text: "Hey! Are we still on for the 3pm sync?", sentAt: dAgo(1.5) },
      { id: "m2", senderId: "me", text: "Yes, I just sent the invite. Check your email.", sentAt: dAgo(1.2) },
      { id: "m3", senderId: "c1", text: "Perfect, thanks!", sentAt: dAgo(1) },
      { id: "m4", senderId: "c1", text: "Also, could you share the whiteboard link before we start?", sentAt: dAgo(0.5) },
    ],
  },
  {
    id: "cv2", contact: CONTACTS[1], unread: 0,
    messages: [
      { id: "m5", senderId: "me",  text: "The new design looks great!", sentAt: dAgo(5) },
      { id: "m6", senderId: "c2", text: "Thanks! I spent all weekend on the color palette.", sentAt: dAgo(4.5) },
      { id: "m7", senderId: "c2", text: "Let me know what the team thinks in the review.", sentAt: dAgo(4.5) },
    ],
  },
  {
    id: "cv3", contact: CONTACTS[2], unread: 1,
    messages: [
      { id: "m8",  senderId: "c3", text: "Did you get a chance to review my PR?", sentAt: dAgo(24) },
      { id: "m9",  senderId: "me", text: "Not yet, on my list for today.", sentAt: dAgo(20) },
      { id: "m10", senderId: "c3", text: "No rush. Just ping me when you're done!", sentAt: dAgo(19) },
      { id: "m11", senderId: "c3", text: "One more thing — I fixed the edge case we discussed.", sentAt: dAgo(3) },
    ],
  },
  {
    id: "cv4", contact: CONTACTS[3], unread: 0,
    messages: [
      { id: "m12", senderId: "me",  text: "Welcome to the team!", sentAt: dAgo(72) },
      { id: "m13", senderId: "c4", text: "Thanks, excited to be here!", sentAt: dAgo(71) },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffH < 48) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function StatusDot({ status }: { status: Contact["status"] }) {
  return (
    <span
      className={cn(
        "block w-2.5 h-2.5 rounded-full border-2 border-base",
        status === "online"  && "bg-success",
        status === "away"    && "bg-warning",
        status === "offline" && "bg-border-subtle",
      )}
    />
  );
}

function Avatar({ contact, size = "md" }: { contact: Contact; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-11 h-11 text-base" };
  return (
    <div
      className={cn("rounded-full flex items-center justify-center font-bold text-white shrink-0", sizes[size])}
      style={{ backgroundColor: contact.color }}
    >
      {contact.initials}
    </div>
  );
}

// ── Conversation list item ─────────────────────────────────────────────────────

function ConversationItem({
  conv,
  selected,
  onSelect,
}: {
  conv: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const last = conv.messages[conv.messages.length - 1];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors",
        selected
          ? "bg-accent-start/10 border-l-2 border-accent-start"
          : "hover:bg-surface-elevated border-l-2 border-transparent",
      )}
    >
      <div className="relative shrink-0">
        <Avatar contact={conv.contact} />
        <span className="absolute bottom-0 right-0">
          <StatusDot status={conv.contact.status} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("text-sm truncate", selected ? "font-semibold text-text-primary" : "font-medium text-text-primary")}>
            {conv.contact.name}
          </span>
          {last && (
            <span className="text-[11px] text-text-tertiary shrink-0">{formatTime(last.sentAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-text-secondary truncate flex-1">
            {last ? (last.senderId === "me" ? `You: ${last.text}` : last.text) : "No messages yet"}
          </p>
          {conv.unread > 0 && (
            <span className="shrink-0 w-4 h-4 rounded-full bg-accent-start text-white text-[10px] font-bold flex items-center justify-center">
              {conv.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function Bubble({ msg, isMe, contact }: { msg: DmMessage; isMe: boolean; contact: Contact }) {
  return (
    <div className={cn("flex gap-2 max-w-[80%]", isMe ? "ml-auto flex-row-reverse" : "mr-auto")}>
      {!isMe && <Avatar contact={contact} size="sm" />}
      <div
        className={cn(
          "px-3 py-2 text-sm rounded-2xl",
          isMe
            ? "bg-accent-start text-white rounded-tr-sm"
            : "bg-surface-elevated text-text-primary rounded-tl-sm border border-border-subtle",
        )}
      >
        <p className="leading-relaxed">{msg.text}</p>
        <p className={cn("text-[10px] mt-1 text-right", isMe ? "text-white/60" : "text-text-tertiary")}>
          {formatTime(msg.sentAt)}
        </p>
      </div>
    </div>
  );
}

// ── Thread header ──────────────────────────────────────────────────────────────

function ThreadHeader({ contact, onBack }: { contact: Contact; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-surface shrink-0">
      <button
        type="button"
        onClick={onBack}
        className="md:hidden p-1 -ml-1 rounded-lg text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
        aria-label="Back to conversations"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div className="relative">
        <Avatar contact={contact} />
        <span className="absolute bottom-0 right-0">
          <StatusDot status={contact.status} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary">{contact.name}</p>
        <p className="text-xs text-text-secondary capitalize">{contact.status}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Voice call"
        >
          <Phone className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Video call"
        >
          <Video className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="More options"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Composer ───────────────────────────────────────────────────────────────────

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  }

  return (
    <div className="px-4 py-3 border-t border-border-subtle bg-surface shrink-0">
      <div
        className="flex items-end gap-2 bg-surface-elevated border border-border-subtle px-3 py-2"
        style={{ borderRadius: "var(--radius-xl)" }}
      >
        <button
          type="button"
          className="p-1 text-text-tertiary hover:text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none max-h-32 leading-relaxed"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="p-2 rounded-full bg-accent-gradient text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
          aria-label="Send message"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-text-tertiary text-center mt-1.5">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}

// ── Message thread ─────────────────────────────────────────────────────────────

function MessageThread({
  conv,
  onBack,
  onSend,
}: {
  conv: Conversation;
  onBack: () => void;
  onSend: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv.messages.length]);

  return (
    <div className="flex flex-col h-full">
      <ThreadHeader contact={conv.contact} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {conv.messages.map((msg) => (
          <Bubble
            key={msg.id}
            msg={msg}
            isMe={msg.senderId === "me"}
            contact={conv.contact}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <Composer onSend={onSend} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showThread, setShowThread] = useState(false);

  const filtered = useMemo(
    () =>
      conversations.filter((c) =>
        c.contact.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [conversations, search],
  );

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setShowThread(true);
    // Clear unread
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    );
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      if (!selectedId) return;
      const msg: DmMessage = {
        id: `msg-${Date.now()}`,
        senderId: "me",
        text,
        sentAt: new Date().toISOString(),
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, messages: [...c.messages, msg] } : c,
        ),
      );
    },
    [selectedId],
  );

  if (!user) return null;

  return (
    <div className="flex h-[calc(100vh-60px)] overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col w-full md:w-72 lg:w-80 border-r border-border-subtle bg-surface shrink-0",
          showThread && selectedId ? "hidden md:flex" : "flex",
        )}
      >
        {/* Sidebar header */}
        <div className="px-4 py-4 border-b border-border-subtle">
          <h2 className="text-base font-semibold text-text-primary mb-2">Messages</h2>
          {/* Direct messages have no backend yet — say so rather than imply delivery. */}
          <p
            role="note"
            className="mb-3 rounded-[var(--radius-sm)] border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[12px] leading-snug text-text-secondary"
          >
            Preview with sample conversations — messages here aren&rsquo;t sent to anyone. To chat
            with people, use the chat inside a meeting room.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-elevated border border-border-subtle text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-start/60 transition-colors"
              style={{ borderRadius: "var(--radius-md)" }}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-center px-4">
              <MessageSquare className="w-8 h-8 text-text-tertiary" />
              <p className="text-sm text-text-secondary">No conversations found.</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                selected={conv.id === selectedId}
                onSelect={() => handleSelect(conv.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Thread panel */}
      <main
        className={cn(
          "flex-1 min-w-0 bg-base",
          !showThread || !selectedId ? "hidden md:flex md:items-center md:justify-center" : "flex flex-col",
        )}
      >
        {selected ? (
          <MessageThread
            conv={selected}
            onBack={() => setShowThread(false)}
            onSend={handleSend}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#7C5CFF26" }}
            >
              <MessageSquare className="w-8 h-8 text-accent-start" />
            </div>
            <div>
              <p className="text-base font-semibold text-text-primary">Your Messages</p>
              <p className="text-sm text-text-secondary mt-1">
                Select a conversation to start chatting.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
