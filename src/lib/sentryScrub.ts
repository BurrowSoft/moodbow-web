import type { Breadcrumb } from "@sentry/nextjs";

// Strict scrubbing for Sentry events. The privacy policy says we remove any
// text you've written (decision 40; product principle 1), so free text is
// dropped outright, not pattern-redacted: error messages, exception values,
// source lines around stack frames, breadcrumb messages, log entries and
// free-form tags can all echo user input.
// What remains is structure: the exception type, the stack (function names,
// files, lines), the route path, browser/OS/runtime, release, environment,
// and request method. No user identity at all (not even the internal id).
// Also dropped: request bodies, headers, cookies, query strings and
// fragments (auth links carry tokens there), console and input breadcrumbs,
// spans and extra data.

// The parts of a Sentry error or transaction event the scrubber touches,
// declared structurally so it works for both event kinds.
type ScrubbableEvent = {
  request?: { url?: string; method?: string; [key: string]: unknown };
  user?: unknown;
  extra?: unknown;
  message?: string;
  exception?: { values?: { type?: string; value?: string; stacktrace?: { frames?: StackFrame[] } }[] };
  transaction?: string;
  breadcrumbs?: Breadcrumb[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  tags?: Record<string, unknown>;
  logentry?: unknown;
  spans?: unknown[];
};

type StackFrame = {
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  vars?: unknown;
  [key: string]: unknown;
};

export const REDACTED = "[redacted]";

// Contexts kept as they are: environment facts only. Everything else is
// dropped (e.g. "nextjs", whose request_path carries the raw query string).
const SAFE_CONTEXTS = ["os", "runtime", "browser", "device", "app", "culture", "cloud_resource"];
// The trace context keeps its ids and status; its data can hold URLs.
const SAFE_TRACE_KEYS = ["trace_id", "span_id", "parent_span_id", "op", "status", "origin"];
// Tags kept: set by the SDK, never free text. URL-valued ones are cut to
// their path; every other tag is dropped.
const SAFE_TAGS = new Set(["runtime", "handled", "mechanism", "level", "environment", "release", "browser", "browser.name", "os", "os.name", "device", "device.family"]);
const URL_TAGS = new Set(["url", "transaction"]);
// Breadcrumb data keys kept (no message, no free-form data).
const SAFE_CRUMB_KEYS = ["method", "status_code"];
const URL_CRUMB_KEYS = ["url", "from", "to"];
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

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
  delete event.user;
  delete event.extra;
  delete event.logentry;
  if (event.message) event.message = REDACTED;
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = REDACTED;
    for (const frame of ex.stacktrace?.frames ?? []) {
      delete frame.context_line;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.vars;
    }
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction) ?? REDACTED;
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
    const tags: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(event.tags)) {
      if (URL_TAGS.has(key) && typeof value === "string") tags[key] = scrubUrl(value) ?? REDACTED;
      else if (SAFE_TAGS.has(key)) tags[key] = value;
    }
    event.tags = tags;
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
  // Structure only: category, type, level, timestamp, and safe data keys.
  // ui.click messages are CSS selectors that can include visible text, and
  // other messages are free text, so no message survives.
  const out: Breadcrumb = {};
  for (const key of ["category", "type", "level", "timestamp"] as const) {
    if (crumb[key] !== undefined) (out as Record<string, unknown>)[key] = crumb[key];
  }
  if (crumb.data) {
    const data: Record<string, unknown> = {};
    for (const key of URL_CRUMB_KEYS) {
      if (typeof crumb.data[key] === "string") data[key] = scrubUrl(crumb.data[key] as string);
    }
    for (const key of SAFE_CRUMB_KEYS) {
      if (crumb.data[key] !== undefined) data[key] = crumb.data[key];
    }
    out.data = data;
  }
  return out;
}
