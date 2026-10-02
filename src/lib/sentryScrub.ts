import type { Breadcrumb } from "@sentry/nextjs";

// Strict scrubbing for Sentry events (product principle 1: nothing a user
// types ever appears in an error report). Errors keep what's needed to debug
// them: the stack, the route path, browser/OS, release and an internal user
// id. Everything that can carry personal data is dropped or redacted:
// request bodies, headers, cookies, query strings and fragments (auth links
// carry tokens there), console output, input breadcrumbs, spans, extra data,
// and emails / phone numbers / Thai IDs in free text.

// The parts of a Sentry error or transaction event the scrubber touches,
// declared structurally so it works for both event kinds.
type ScrubbableEvent = {
  request?: { url?: string; method?: string; [key: string]: unknown };
  user?: { id?: string | number; [key: string]: unknown };
  extra?: unknown;
  message?: string;
  exception?: { values?: { value?: string; stacktrace?: { frames?: StackFrame[] } }[] };
  transaction?: string;
  breadcrumbs?: Breadcrumb[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  tags?: Record<string, unknown>;
  logentry?: { message?: string; params?: unknown[]; [key: string]: unknown };
  spans?: unknown[];
};

type StackFrame = {
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  vars?: unknown;
  [key: string]: unknown;
};

// Contexts kept as they are: environment facts only. Everything else is
// dropped (e.g. "nextjs", whose request_path carries the raw query string).
const SAFE_CONTEXTS = ["os", "runtime", "browser", "device", "app", "culture", "cloud_resource"];
// The trace context keeps its ids and status; its data can hold URLs.
const SAFE_TRACE_KEYS = ["trace_id", "span_id", "parent_span_id", "op", "status", "origin"];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Thai national ID (13 digits, often written 1-2345-67890-12-3).
const THAI_ID = /\b\d[- ]?\d{4}[- ]?\d{5}[- ]?\d{2}[- ]?\d\b/g;
// Phone-like runs: 8+ digits, optionally with +, spaces, dots, dashes, parens.
const PHONE = /\+?\(?\d[\d\s().-]{7,}\d/g;
// Absolute URLs inside free text (error messages, breadcrumb messages).
const URL_IN_TEXT = /https?:\/\/[^\s"'<>`)\]]+/g;
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

export function scrubText(text: string): string {
  // URLs first, cut down to their path, before the digit patterns below
  // could mangle them.
  return text
    .replace(URL_IN_TEXT, (url) => scrubUrl(url) ?? "[url]")
    .replace(EMAIL, "[email]")
    .replace(THAI_ID, "[thai_id]")
    .replace(PHONE, "[phone]");
}

// Origin + path only: no query string and no fragment at all (tokens,
// emails, search terms), and record ids in the path become [id].
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const absolute = /^https?:\/\//i.test(url);
  let parsed: URL;
  try {
    parsed = new URL(absolute ? url : `https://x.invalid${url.startsWith("/") ? "" : "/"}${url}`);
  } catch {
    return undefined;
  }
  const path = parsed.pathname.replace(UUID_SEGMENT, "/[id]");
  return absolute ? `${parsed.origin}${path}` : path;
}

// Returns the same (mutated) event object, typed as passed in, so it fits
// Sentry's beforeSend and beforeSendTransaction alike.
export function scrubEvent<T extends object>(input: T): T {
  const event = input as ScrubbableEvent;
  if (event.request) {
    event.request = { url: scrubUrl(event.request.url), method: event.request.method };
  }
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : {};
  delete event.extra;
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
    // Source lines around each frame, and local variables if ever enabled.
    for (const frame of ex.stacktrace?.frames ?? []) {
      if (frame.context_line) frame.context_line = scrubText(frame.context_line);
      if (frame.pre_context) frame.pre_context = frame.pre_context.map(scrubText);
      if (frame.post_context) frame.post_context = frame.post_context.map(scrubText);
      delete frame.vars;
    }
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction) ?? event.transaction;
  if (event.contexts) {
    const contexts: NonNullable<ScrubbableEvent["contexts"]> = {};
    for (const key of SAFE_CONTEXTS) {
      if (event.contexts[key]) contexts[key] = event.contexts[key];
    }
    const trace = event.contexts.trace;
    if (trace) {
      contexts.trace = {};
      for (const key of SAFE_TRACE_KEYS) {
        if (trace[key] !== undefined) contexts.trace[key] = trace[key];
      }
    }
    event.contexts = contexts;
  }
  if (event.tags) {
    for (const [key, value] of Object.entries(event.tags)) {
      if (typeof value !== "string") continue;
      event.tags[key] = /^(https?:\/\/|\/)/.test(value) ? (scrubUrl(value) ?? "[url]") : scrubText(value);
    }
  }
  if (event.logentry) {
    event.logentry = { message: event.logentry.message ? scrubText(event.logentry.message) : undefined };
  }
  // Spans carry full URLs (Supabase REST filters, auth links). Tracing is
  // off; any span that still arrives is dropped.
  delete event.spans;
  event.breadcrumbs = (event.breadcrumbs ?? [])
    .map((b) => scrubBreadcrumb(b))
    .filter((b): b is Breadcrumb => b !== null);
  return input;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // Console output and input events can contain anything the user typed.
  if (crumb.category === "console" || crumb.category === "ui.input") return null;
  const out: Breadcrumb = { ...crumb };
  if (out.message) out.message = scrubText(out.message);
  if (out.data) {
    const data: Record<string, unknown> = {};
    for (const key of ["url", "from", "to"]) {
      if (typeof out.data[key] === "string") data[key] = scrubUrl(out.data[key] as string);
    }
    for (const key of ["method", "status_code"]) {
      if (out.data[key] !== undefined) data[key] = out.data[key];
    }
    out.data = data;
  }
  return out;
}
