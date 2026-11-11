"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Check,
  FolderOpen,
  Lock,
  Menu,
  MessageSquare,
  Mic,
  Moon,
  MonitorUp,
  PenTool,
  PhoneOff,
  Sun,
  Video,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  Reveal,
  TiltCard,
  useLiteGraphics,
  usePrefersReducedMotion,
  useWebGL,
} from "@/components/landing/effects";

// three.js is large: load the 3D scene only in the browser, only on this page.
const HeroScene = dynamic(() => import("@/components/landing/HeroScene"), {
  ssr: false,
  loading: () => <SceneFallback />,
});

// ── Content (every number here is a real property of the app) ──────────────

const FEATURES = [
  {
    icon: Video,
    title: "HD video & screen sharing",
    body: "Peer-to-peer WebRTC calls with camera, mic and screen sharing — media flows directly between participants.",
    accent: "#7C5CFF",
  },
  {
    icon: MessageSquare,
    title: "Live room chat",
    body: "Message everyone in the call, share files inline, and pick up the history when you rejoin.",
    accent: "#3D8BFF",
  },
  {
    icon: PenTool,
    title: "Collaborative whiteboard",
    body: "Sketch together with shapes, pens, text and sticky notes. Save a board to Files and reopen it to keep editing.",
    accent: "#22C55E",
  },
  {
    icon: FolderOpen,
    title: "File sharing",
    body: "Upload, favourite, rename and restore from Trash. Files shared into a room are available to everyone in it.",
    accent: "#F59E0B",
  },
  {
    icon: Lock,
    title: "Private rooms",
    body: "Rooms are visible only to members. Join with a 6-character code, optionally protected by a password.",
    accent: "#06B6D4",
  },
  {
    icon: Bell,
    title: "Notifications & presence",
    body: "Know when someone joins your room or shares a file, and see who’s in a call right now.",
    accent: "#EC4899",
  },
];

const STEPS = [
  { title: "Create a room", body: "Give it a name and, if you like, a password." },
  { title: "Share the code", body: "Send the 6-character join code to your team." },
  { title: "Meet & create", body: "Talk, chat, draw on the whiteboard and share files." },
];

const FACTS = [
  { value: "6", label: "character join codes" },
  { value: "100 MB", label: "per uploaded file" },
  { value: "10 GB", label: "of storage per user" },
  { value: "0", label: "installs — runs in the browser" },
];

const PRIVACY = [
  "Audio and video travel peer-to-peer, not through our servers",
  "Rooms, chat and files are visible only to room members",
  "Sign-in and join codes are rate-limited against guessing",
  "Export or permanently delete your data at any time",
];

// ── Pieces ────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start">
      <span className="relative h-8 w-8">
        <span className="absolute inset-1 rotate-45 rounded-[5px] bg-accent-gradient" />
        <span className="absolute inset-[11px] rotate-45 rounded-[2px] bg-white/25" />
      </span>
      <span className="text-lg font-semibold text-accent-gradient">Durotto</span>
    </Link>
  );
}

/** Static stand-in while the 3D chunk loads, or when WebGL is unavailable. */
function SceneFallback() {
  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <div className="absolute h-56 w-56 rounded-full bg-accent-gradient opacity-30 blur-3xl" />
      <div className="absolute h-72 w-72 rounded-full border border-accent-start/30" />
      <div className="absolute h-96 w-96 rounded-full border border-accent-end/20" />
      <div className="relative h-24 w-24 rotate-45 rounded-2xl bg-accent-gradient shadow-2xl shadow-accent-start/40" />
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  function toggle() {
    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    setTheme(resolved === "dark" ? "light" : "dark");
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle text-text-secondary transition hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-start"
      aria-label="Toggle colour theme"
    >
      <Sun className="hidden h-4 w-4 [[data-theme=dark]_&]:block" />
      <Moon className="block h-4 w-4 [[data-theme=dark]_&]:hidden" />
    </button>
  );
}

function NavBar() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#privacy", label: "Privacy" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle/60 bg-base/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" aria-label="Main">
        <Logo />
        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-text-secondary transition hover:text-text-primary">
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="hidden rounded-full bg-accent-gradient px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-start/25 transition hover:opacity-90 sm:inline-flex"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden px-3 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary sm:inline-flex">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="hidden rounded-full bg-accent-gradient px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-start/25 transition hover:opacity-90 sm:inline-flex"
              >
                Get started
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle text-text-primary md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>
      {open ? (
        <div id="mobile-menu" className="border-t border-border-subtle bg-surface px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-text-primary hover:bg-surface-elevated"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {isAuthenticated ? (
                <Link href="/dashboard" className="col-span-2 rounded-full bg-accent-gradient px-4 py-2.5 text-center text-sm font-semibold text-white">
                  Open dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="rounded-full border border-border-subtle px-4 py-2.5 text-center text-sm font-medium text-text-primary">
                    Sign in
                  </Link>
                  <Link href="/signup" className="rounded-full bg-accent-gradient px-4 py-2.5 text-center text-sm font-semibold text-white">
                    Get started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Hero() {
  const { isAuthenticated } = useAuth();
  const webgl = useWebGL();
  const reduced = usePrefersReducedMotion();
  const lite = useLiteGraphics();
  const sceneRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Stop rendering the 3D scene while it's scrolled out of view.
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative overflow-hidden">
      {/* backdrop: glow + perspective grid */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent-start/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[380px] rounded-full bg-accent-end/15 blur-[110px]" />
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 opacity-40 [mask-image:linear-gradient(to_top,black,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            transform: "perspective(600px) rotateX(60deg)",
            transformOrigin: "bottom",
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-6 px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-20 lg:pt-20">
        <div className="text-center lg:text-left">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent-start/30 bg-accent-start/10 px-3 py-1 text-xs font-medium text-accent-start">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              Video · Chat · Whiteboard · Files
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              Meet, talk and sketch ideas{" "}
              <span className="text-accent-gradient">together — in real time.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-text-secondary sm:text-lg lg:mx-0">
              Durotto puts video calls, live chat, a shared whiteboard and file sharing in one
              browser tab. Create a room, share a code, and start collaborating in seconds.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link
                href={isAuthenticated ? "/dashboard" : "/signup"}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-gradient px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-accent-start/30 transition hover:-translate-y-0.5 hover:shadow-accent-start/50 sm:w-auto"
              >
                {isAuthenticated ? "Open dashboard" : "Get started free"}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={isAuthenticated ? "/join" : "/login"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border-subtle bg-surface/60 px-6 py-3 text-sm font-semibold text-text-primary backdrop-blur transition hover:border-accent-start/60 sm:w-auto"
              >
                {isAuthenticated ? "Join with a code" : "Sign in"}
              </Link>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-text-tertiary lg:justify-start">
              {["Peer-to-peer media", "No install", "Dark & light themes"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-success" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div ref={sceneRef} className="relative h-[340px] sm:h-[440px] lg:h-[560px]">
          {webgl ? (
            <HeroScene animate={!reduced} lite={lite} active={visible} />
          ) : (
            <SceneFallback />
          )}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-start">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">{title}</h2>
      {body ? <p className="mt-4 text-[16px] leading-relaxed text-text-secondary">{body}</p> : null}
    </Reveal>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Features"
          title="Everything a meeting needs"
          body="No juggling between apps — every tool lives inside the room."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <TiltCard className="h-full rounded-[var(--radius-xl)]">
                <div className="h-full rounded-[var(--radius-xl)] border border-border-subtle bg-surface p-6 shadow-sm transition-colors group-hover:border-accent-start/40">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl [transform:translateZ(30px)]"
                    style={{ backgroundColor: `${f.accent}22`, color: f.accent }}
                  >
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-text-primary [transform:translateZ(20px)]">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{f.body}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A CSS-3D mock of the meeting screen that tilts with the pointer. */
function RoomPreview() {
  const tiles = [
    { name: "Ava", color: "#7C5CFF" },
    { name: "Leo", color: "#3D8BFF" },
    { name: "Mia", color: "#22C55E" },
    { name: "Noah", color: "#F59E0B" },
  ];
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Inside a room" title="One screen, every way to collaborate" />
        <Reveal className="mt-12 [perspective:1600px]">
          <TiltCard max={6} className="mx-auto max-w-5xl rounded-[24px]">
            <div className="overflow-hidden rounded-[24px] border border-border-subtle bg-surface shadow-2xl shadow-accent-start/10 [transform:rotateX(8deg)] transition-transform duration-500 group-hover:[transform:rotateX(0deg)]">
              {/* title bar */}
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
                  <span className="ml-3 hidden text-sm font-medium text-text-primary sm:inline">Design review</span>
                </div>
                <span className="rounded-full bg-surface-elevated px-3 py-1 font-mono text-xs text-text-secondary">K7QX2M</span>
              </div>
              <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-[1fr_240px]">
                <div className="grid grid-cols-2 gap-3">
                  {tiles.map((t) => (
                    <div
                      key={t.name}
                      className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-base"
                      style={{ boxShadow: `inset 0 0 60px ${t.color}33` }}
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white sm:h-14 sm:w-14 sm:text-lg"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.name[0]}
                      </span>
                      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t.name}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="hidden flex-col gap-2 rounded-xl border border-border-subtle bg-base p-3 md:flex">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Chat</p>
                  <div className="self-start rounded-2xl rounded-bl-sm bg-surface-elevated px-3 py-2 text-xs text-text-primary">Can everyone see the board?</div>
                  <div className="self-end rounded-2xl rounded-br-sm bg-accent-gradient px-3 py-2 text-xs text-white">Yes! Adding notes now ✏️</div>
                  <div className="self-start rounded-2xl rounded-bl-sm bg-surface-elevated px-3 py-2 text-xs text-text-primary">Sharing the spec 📎</div>
                  <div className="mt-auto rounded-full border border-border-subtle px-3 py-2 text-xs text-text-tertiary">Type a message…</div>
                </div>
              </div>
              {/* controls */}
              <div className="flex items-center justify-center gap-2 border-t border-border-subtle py-3 sm:gap-3">
                {[Mic, Video, MonitorUp, MessageSquare, PenTool].map((Icon, i) => (
                  <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-text-secondary sm:h-10 sm:w-10">
                    <Icon className="h-4 w-4" />
                  </span>
                ))}
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-danger text-white sm:h-10 sm:w-10">
                  <PhoneOff className="h-4 w-4" />
                </span>
              </div>
            </div>
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y border-border-subtle bg-surface/50 px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="How it works" title="From idea to meeting in three steps" />
        <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
          <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-7 hidden h-px bg-gradient-to-r from-accent-start/0 via-accent-start/50 to-accent-end/0 md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 120}>
              <li className="relative flex flex-col items-center text-center">
                <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-gradient text-lg font-bold text-white shadow-lg shadow-accent-start/30">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-text-primary">{s.title}</h3>
                <p className="mt-2 max-w-xs text-sm text-text-secondary">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Facts() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 lg:grid-cols-4">
        {FACTS.map((f, i) => (
          <Reveal key={f.label} delay={i * 80}>
            <TiltCard max={8} className="rounded-[var(--radius-xl)]">
              <div className="rounded-[var(--radius-xl)] border border-border-subtle bg-surface px-5 py-6 text-center">
                <p className="text-3xl font-bold text-accent-gradient sm:text-4xl">{f.value}</p>
                <p className="mt-1 text-sm text-text-secondary">{f.label}</p>
              </div>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-start">Privacy</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Your conversations stay yours
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-text-secondary">
            Durotto is built so the people in a room — and only them — can see what happens there.
          </p>
          <ul className="mt-8 space-y-4">
            {PRIVACY.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-text-primary sm:text-[16px]">{p}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="[perspective:1200px]">
          <TiltCard max={12} className="mx-auto aspect-square max-w-sm rounded-[32px]">
            <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[32px] border border-border-subtle bg-surface">
              <div className="absolute h-3/4 w-3/4 rounded-full bg-accent-gradient opacity-20 blur-3xl" />
              <div className="absolute h-[70%] w-[70%] rounded-full border border-accent-start/30 [transform:translateZ(20px)]" />
              <div className="absolute h-[50%] w-[50%] rounded-full border border-accent-end/30 [transform:translateZ(40px)]" />
              <span className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-accent-gradient text-white shadow-2xl shadow-accent-start/40 [transform:translateZ(70px)]">
                <Lock className="h-10 w-10" />
              </span>
            </div>
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  const { isAuthenticated } = useAuth();
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[32px] bg-accent-gradient px-6 py-14 text-center shadow-2xl shadow-accent-start/30 sm:px-12 sm:py-20">
          <div aria-hidden="true" className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-black/15 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">Ready to start your first room?</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[16px] text-white/85">
            It takes a minute to set up — invite your team with a code and you’re live.
          </p>
          <Link
            href={isAuthenticated ? "/dashboard" : "/signup"}
            className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-[#3D2FB0] shadow-xl transition hover:-translate-y-0.5"
          >
            {isAuthenticated ? "Open dashboard" : "Create a free account"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-subtle px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo />
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-text-secondary" aria-label="Legal">
          <Link href="/legal/terms" className="hover:text-text-primary">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-text-primary">Privacy</Link>
          <Link href="/legal/licenses" className="hover:text-text-primary">Licenses</Link>
        </nav>
        <p className="text-sm text-text-tertiary">© {new Date().getFullYear()} Durotto</p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-base text-text-primary">
      <NavBar />
      <main>
        <Hero />
        <Features />
        <RoomPreview />
        <HowItWorks />
        <Facts />
        <Privacy />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
