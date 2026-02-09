/**
 * WebSocket Origin validation to prevent cross-origin token theft (CVE-2026-25253).
 * 
 * This prevents malicious websites from opening WebSocket connections to the
 * local gateway and stealing authentication tokens.
 */

type OriginCheckResult = { ok: true } | { ok: false; reason: string };

function normalizeHostHeader(hostHeader?: string): string {
  return (hostHeader ?? "").trim().toLowerCase();
}

function resolveHostName(hostHeader?: string): string {
  const host = normalizeHostHeader(hostHeader);
  if (!host) {
    return "";
  }
  // IPv6 format: [::1]:3000
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end !== -1) {
      return host.slice(1, end);
    }
  }
  // IPv4/domain format: localhost:3000
  const [name] = host.split(":");
  return name ?? "";
}

function parseOrigin(
  originRaw?: string,
): { origin: string; host: string; hostname: string } | null {
  const trimmed = (originRaw ?? "").trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return {
      origin: url.origin.toLowerCase(),
      host: url.host.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  if (!hostname) {
    return false;
  }
  if (hostname === "localhost") {
    return true;
  }
  if (hostname === "::1") {
    return true;
  }
  if (hostname === "127.0.0.1" || hostname.startsWith("127.")) {
    return true;
  }
  return false;
}

/**
 * Check if browser WebSocket origin is allowed.
 * 
 * Allows:
 * - Origins in the allowedOrigins config list
 * - Same-origin connections (origin matches request Host header)
 * - Loopback-to-loopback (localhost -> localhost)
 * 
 * Rejects:
 * - Cross-origin connections from untrusted origins
 * - Missing or invalid Origin header
 */
export function checkBrowserOrigin(params: {
  requestHost?: string;
  origin?: string;
  allowedOrigins?: string[];
}): OriginCheckResult {
  const parsedOrigin = parseOrigin(params.origin);
  if (!parsedOrigin) {
    return { ok: false, reason: "origin missing or invalid" };
  }

  // Check allowlist (e.g., https://control.example.com)
  const allowlist = (params.allowedOrigins ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.includes(parsedOrigin.origin)) {
    return { ok: true };
  }

  // Check same-origin (Origin matches request Host header)
  const requestHost = normalizeHostHeader(params.requestHost);
  if (requestHost && parsedOrigin.host === requestHost) {
    return { ok: true };
  }

  // Allow loopback-to-loopback
  const requestHostname = resolveHostName(requestHost);
  if (isLoopbackHost(parsedOrigin.hostname) && isLoopbackHost(requestHostname)) {
    return { ok: true };
  }

  return { ok: false, reason: "origin not allowed" };
}
