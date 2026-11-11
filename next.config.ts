import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Origin of an absolute URL, or null for relative/invalid values. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Extra hosts the browser may talk to: the FastAPI backend (HTTP + WebSocket)
// and an optional ICE/TURN credentials endpoint.
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const connectSources = [
  "'self'",
  apiOrigin,
  apiOrigin?.replace(/^http/, "ws"),
  originOf(process.env.NEXT_PUBLIC_ICE_SERVERS_ENDPOINT),
  isDev ? "ws:" : null, // dev-server hot reload
].filter(Boolean);

// Next.js inlines bootstrap scripts, so 'unsafe-inline' is required without
// per-request nonces; dev additionally needs 'unsafe-eval' for fast refresh.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: mediastream:",
  `connect-src ${connectSources.join(" ")}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to every route
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Prevent clickjacking (also covered by frame-ancestors)
          { key: "X-Frame-Options", value: "DENY" },
          // Block MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The legacy XSS auditor is itself exploitable; modern guidance is to disable it.
          { key: "X-XSS-Protection", value: "0" },
          // Restrict referrer information
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera/mic/screen for WebRTC; nothing else.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
          },
          ...(isDev
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
      {
        // The API is same-origin by default; this only matters if another
        // origin calls it. Static headers can name a single origin.
        source: "/api/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: ALLOWED_ORIGINS[0] ?? "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
