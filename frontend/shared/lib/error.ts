/** Error sanitization layer.
 *
 *  Goal: never show raw React/Convex/network stacks to end users. The
 *  user does not know what `useQuery is undefined` or
 *  `[CONVEX M(pages:create)] permission_denied` means. Internally we still
 *  want to see the raw error in dev — so logError() prints to console only
 *  when NODE_ENV !== "production".
 *
 *  Surfaces that should call sanitizeError(): Sonner toasts, error boundary
 *  fallbacks, app/error.tsx, anywhere user-visible. Internal call sites
 *  (Convex action retries, telemetry) should keep getErrorMessage(). */

export type ErrorCategory =
  | "chunk"
  | "network"
  | "auth"
  | "permission"
  | "validation"
  | "not-found"
  | "rate-limit"
  | "server"
  | "convex"
  | "unknown";

export interface SanitizedError {
  category: ErrorCategory;
  /** User-safe message — no stack, no internal identifiers. */
  message: string;
  /** True when reloading is the right next step (chunk / version mismatch). */
  retryable: boolean;
}

/** Extract a human-readable message from an unknown thrown value.
 *  Use in catch blocks to drop `catch (e: any)` typings. */
export function getErrorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    const s = JSON.stringify(err);
    // JSON.stringify(undefined) returns the value undefined, not the string.
    return typeof s === "string" ? s : fallback;
  } catch {
    return fallback;
  }
}

/** Categorise an unknown error into one of our user-facing buckets and
 *  return a message safe to display in the UI. */
export function sanitizeError(err: unknown): SanitizedError {
  const raw = getErrorMessage(err, "");
  const lower = raw.toLowerCase();
  const name = err && typeof err === "object" && "name" in err
    ? String((err as { name?: unknown }).name ?? "")
    : "";

  if (
    name === "ChunkLoadError" ||
    lower.includes("loading chunk") ||
    lower.includes("failed to load chunk") ||
    lower.includes("loading css chunk") ||
    lower.includes("chunkloaderror") ||
    /\/_next\/static\/chunks\/[^\s]+\.js/i.test(raw)
  ) {
    return { category: "chunk", message: "A new version was deployed. Reload to continue.", retryable: true };
  }
  if (
    name === "AbortError" ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("err_internet_disconnected") ||
    lower.includes("load failed") ||
    lower === "network error"
  ) {
    return { category: "network", message: "Connection problem. Check your internet and try again.", retryable: true };
  }
  if (
    lower.includes("unauthenticated") ||
    lower.includes("not authenticated") ||
    lower.includes("not signed in") ||
    lower.includes("auth required") ||
    lower.includes("invalidaccount") ||
    lower.includes("invalidsecret") ||
    /\b401\b/.test(raw)
  ) {
    return { category: "auth", message: "You're signed out. Please sign in again.", retryable: false };
  }
  if (
    lower.includes("permission_denied") ||
    lower.includes("permission denied") ||
    lower.includes("forbidden") ||
    lower.includes("not allowed") ||
    /\b403\b/.test(raw)
  ) {
    return { category: "permission", message: "You don't have access to do that.", retryable: false };
  }
  if (
    lower.includes("argumentvalidationerror") ||
    lower.includes("validator error") ||
    lower.includes("invalid argument") ||
    lower.includes("zoderror") ||
    name === "ZodError"
  ) {
    return { category: "validation", message: "That input doesn't look right. Please review and try again.", retryable: false };
  }
  if (
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    /\b404\b/.test(raw)
  ) {
    return { category: "not-found", message: "We couldn't find what you were looking for.", retryable: false };
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    /\b429\b/.test(raw)
  ) {
    return { category: "rate-limit", message: "You're going a little fast. Wait a moment and try again.", retryable: true };
  }
  if (
    raw.includes("[CONVEX") ||
    lower.includes("convexerror") ||
    name === "ConvexError"
  ) {
    return { category: "convex", message: "Couldn't save changes. Please try again.", retryable: true };
  }
  if (/\b5\d{2}\b/.test(raw) || lower.includes("internal server error")) {
    return {
      category: "server",
      message: "Something went wrong on our side. Please try again.",
      retryable: true,
    };
  }

  return {
    category: "unknown",
    message: "Something went wrong. Please try again.",
    retryable: true,
  };
}

/** Log an error to the console — dev/preview only. In production this is
 *  a no-op so we don't leak stacks into user devtools or feed log shippers
 *  with PII-shaped Convex payloads.
 *
 *  Use alongside sanitizeError() — toast/UI gets the sanitized message,
 *  console gets the raw error for debugging.
 *
 *  NOTE: this is the *raw* channel and stays dev-only. The production
 *  channel is captureError() below, which emits a redacted structured
 *  line instead. */
export function logError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.error(`[${scope}]`, err, extra ?? "");
}

/* ------------------------------------------------------------------ *
 * Structured capture
 *
 * instrumentation.ts#onRequestError emits one JSON line per SERVER
 * request error (level/msg/message/stack/route/method/digest/...) to
 * stdout, which the host captures. Nothing did the equivalent for
 * errors that happen in the browser — a client render/runtime throw
 * showed a toast and was then dropped on the floor, so the maintainer
 * never learned it happened.
 *
 * captureError() closes that: same field names, same one-line JSON
 * shape, plus `source` so client and server errors grep together.
 *
 * PRIVACY — deliberately excluded from the emitted payload:
 *   - page / block content and any user-authored prose (we never read it,
 *     and anything that leaks into a message or `extra` string is passed
 *     through redact() and hard-truncated)
 *   - emails, bearer tokens, JWTs, Convex admin keys, long hex/base64
 *     blobs, and secret-looking query params (redact())
 *   - the URL query string and hash entirely — pathname only, since
 *     share slugs / invite codes / ?token= live in search
 *   - user ids, workspace ids and auth state — never read here
 *   - non-primitive `extra` values, which are the usual way a whole
 *     document object accidentally ends up in a log line
 * ------------------------------------------------------------------ */

/** Best-effort scrub of secret-shaped substrings. Order matters: the
 *  specific patterns run before the greedy hex/base64 one. */
function redact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    // Convex admin/deploy keys: "instance-name|<long opaque>"
    .replace(/\b[a-z0-9-]{3,}\|[A-Za-z0-9]{16,}/g, "[key]")
    // `\b` (not `[?&]`) so this also catches secrets pasted into free-text
    // error messages, not just ones sitting in a query string.
    .replace(
      /(\b(?:token|key|secret|password|passwd|apikey|auth|sig|signature|session)=)[^&\s"']+/gi,
      "$1[redacted]",
    )
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[hash]");
}

const MAX_MESSAGE = 300;
const MAX_STACK = 2000;
const MAX_EXTRA_VALUE = 120;

function clean(s: unknown, max: number): string | undefined {
  if (typeof s !== "string" || !s) return undefined;
  return redact(s).slice(0, max);
}

/** Only primitives survive — objects/arrays are dropped rather than
 *  stringified, because that is how document bodies leak into logs. */
function cleanExtra(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!extra) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === "string") {
      const c = clean(v, MAX_EXTRA_VALUE);
      if (c !== undefined) out[k] = c;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
    // objects, arrays, functions, null, undefined → dropped on purpose
  }
  return Object.keys(out).length ? out : undefined;
}

/** Pathname only — never search or hash (share slugs, ?token=, invite
 *  codes live there). Undefined on the server, where onRequestError
 *  already records the route. */
function currentRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.location.pathname;
  } catch {
    return undefined;
  }
}

// Flood guard: a render loop can throw the same error thousands of times
// per second. Emit each distinct error at most once per window, and stop
// entirely after a hard cap so we never wedge the tab or the log stream.
const DEDUPE_MS = 10_000;
const MAX_EMITS = 50;
const seen = new Map<string, number>();
let emitted = 0;

/** Emit ONE redacted, structured JSON line describing an error, in the
 *  same shape instrumentation.ts uses for server request errors.
 *
 *  Runs in dev and production (unlike logError). Safe to call from error
 *  boundaries, `app/**\/error.tsx`, and window error listeners. */
export function captureError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  try {
    if (emitted >= MAX_EMITS) return;

    const e = err instanceof Error ? err : undefined;
    const message = clean(getErrorMessage(err, "Unknown error"), MAX_MESSAGE) ?? "Unknown error";

    const key = `${scope}:${message}`;
    const now = Date.now();
    const last = seen.get(key);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    seen.set(key, now);
    emitted += 1;

    const digest =
      err && typeof err === "object" && "digest" in err
        ? clean(String((err as { digest?: unknown }).digest ?? ""), 64)
        : undefined;

    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        msg: "client_error",
        source: typeof window === "undefined" ? "server" : "client",
        scope,
        category: sanitizeError(err).category,
        name: e?.name,
        message,
        stack: clean(e?.stack, MAX_STACK),
        route: currentRoute(),
        digest,
        extra: cleanExtra(extra),
      }),
    );
  } catch {
    /* logging must never throw into the caller's error path */
  }
}

/** Test seam — resets the flood guard between cases. */
export function __resetErrorCapture(): void {
  seen.clear();
  emitted = 0;
}

/** Convenience: sanitize + log in one call. Returns the SanitizedError so
 *  callers can pass `.message` straight into a toast.
 *
 *  Two channels on purpose: logError() gives the dev the real Error object
 *  (clickable stack in devtools) and is silent in prod; captureError()
 *  gives the maintainer a redacted grep-able line in every environment. */
export function reportError(scope: string, err: unknown, extra?: Record<string, unknown>): SanitizedError {
  logError(scope, err, extra);
  captureError(scope, err, extra);
  return sanitizeError(err);
}
