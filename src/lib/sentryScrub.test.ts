import { describe, expect, it } from "vitest";
import { REDACTED, scrubBreadcrumb, scrubEvent, scrubUrl } from "./sentryScrub";

// A diary sentence a user might type; it must never survive scrubbing.
const DIARY = "felt anxious after the call with Mom";

describe("scrubUrl", () => {
  it("keeps origin + path, drops query and fragment", () => {
    expect(scrubUrl("https://www.moodbow.com/email-confirmed?code=abc#access_token=secret")).toBe(
      "https://www.moodbow.com/email-confirmed",
    );
    expect(scrubUrl("/auth/confirm?token_hash=abc&type=signup")).toBe("/auth/confirm");
  });

  it("replaces record ids in the path", () => {
    expect(scrubUrl("/app/entries/0b9c5f7e-1d2a-4c3b-9e8f-7a6b5c4d3e2f/edit")).toBe("/app/entries/[id]/edit");
  });

  it("replaces days in the path (L1): request urls, transactions and breadcrumbs all go through here", () => {
    expect(scrubUrl("https://www.moodbow.com/app/timeline/2026-10-18")).toBe("https://www.moodbow.com/app/timeline/[date]");
    expect(scrubUrl("/app/timeline/2026-10-18/edit")).toBe("/app/timeline/[date]/edit");
    // Only whole segments: a date inside a longer segment stays as it is.
    expect(scrubUrl("/help/2026-10-18-notes")).toBe("/help/2026-10-18-notes");
    expect(scrubEvent({ transaction: "/app/timeline/2026-10-18" }).transaction).toBe("/app/timeline/[date]");
  });

  it("replaces months in the path too (1.1 N print, as the app's #73)", () => {
    expect(scrubUrl("https://www.moodbow.com/app/print/2026-10")).toBe("https://www.moodbow.com/app/print/[date]");
    expect(scrubUrl("/th/app/print/2026-10/")).toBe("/th/app/print/[date]/");
    expect(scrubUrl("/help/2026-10-notes")).toBe("/help/2026-10-notes");
  });
});

describe("scrubEvent", () => {
  const event = () =>
    scrubEvent({
      message: `Save failed: ${DIARY}`,
      request: {
        url: `https://www.moodbow.com/app?q=${encodeURIComponent(DIARY)}`,
        method: "POST",
        data: DIARY,
        headers: { cookie: "sb=1" },
        cookies: { sb: "1" },
      },
      user: { id: "0b9c5f7e-1d2a-4c3b-9e8f-7a6b5c4d3e2f", email: "jane@example.com", ip_address: "1.2.3.4" },
      extra: { body: DIARY },
      logentry: { message: "entry %s", params: [DIARY] },
      spans: [{ description: "GET /rest/v1/entries?body=x" }],
      contexts: {
        browser: { name: "Chrome" },
        nextjs: { request_path: "/app?q=private" },
        trace: { trace_id: "t", span_id: "s", data: { url: "https://x?y" } },
      },
      tags: { url: "https://www.moodbow.com/a?b=c", runtime: "browser", note: DIARY, handled: "no" },
      exception: {
        values: [
          {
            type: "TypeError",
            value: `Cannot read "${DIARY}"`,
            mechanism: { type: "onerror", handled: false, data: { target: DIARY } },
            stacktrace: {
              frames: [{ filename: "app.js", function: "save", lineno: 3, context_line: `save("${DIARY}")`, pre_context: [DIARY], vars: { body: DIARY } }],
            },
          },
        ],
      },
      breadcrumbs: [{ category: "navigation", message: DIARY, data: { from: "/a?x=1", to: "/b#t", note: DIARY } }],
    });

  it("no free text survives anywhere", () => {
    const json = JSON.stringify(event());
    expect(json).not.toContain("anxious");
    expect(json).not.toContain("jane@example.com");
    expect(json).not.toContain("private");
  });

  it("drops the user entirely, including the internal id", () => {
    expect("user" in event()).toBe(false);
  });

  it("drops thread stacks (L2): their frames carry source lines too", () => {
    const scrubbed = scrubEvent({ threads: { values: [{ stacktrace: { frames: [{ context_line: `save("${DIARY}")` }] } }] } });
    expect("threads" in scrubbed).toBe(false);
  });

  it("keeps structure: exception type, stack frames, route path, method, safe contexts and tags", () => {
    const e = event();
    expect(e.message).toBe(REDACTED);
    expect(e.request).toEqual({ url: "https://www.moodbow.com/app", method: "POST" });
    expect(e.exception.values[0]).toEqual({
      type: "TypeError",
      value: REDACTED,
      mechanism: { type: "onerror", handled: false },
      stacktrace: { frames: [{ filename: "app.js", function: "save", lineno: 3 }] },
    });
    expect(e.contexts).toEqual({ browser: { name: "Chrome" }, trace: { trace_id: "t", span_id: "s" } });
    expect(e.tags).toEqual({ url: "https://www.moodbow.com/a", runtime: "browser", handled: "no" });
    expect(e.breadcrumbs).toEqual([{ category: "navigation", data: { from: "/a", to: "/b" } }]);
    for (const key of ["extra", "logentry", "spans"]) expect(key in e, key).toBe(false);
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console output and input breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: DIARY })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.input", message: "textarea" })).toBeNull();
  });

  it("drops messages (ui.click selectors can contain visible text)", () => {
    expect(scrubBreadcrumb({ category: "ui.click", message: `button[aria-label="${DIARY}"]`, level: "info" })).toEqual({
      category: "ui.click",
      level: "info",
    });
  });

  it("keeps only safe data keys, with URLs cut to their path", () => {
    expect(
      scrubBreadcrumb({
        category: "fetch",
        type: "http",
        data: { url: "https://x.supabase.co/rest/v1/entries?select=*&body=eq.hi", method: "GET", status_code: 200, request_body: "hi" },
      }),
    ).toEqual({ category: "fetch", type: "http", data: { url: "https://x.supabase.co/rest/v1/entries", method: "GET", status_code: 200 } });
  });
});

// Coverage pass (UX): the edges, where scrubbing must fail safe.
describe("scrubbing at the edges", () => {
  it("scrubUrl: nothing stays nothing; a relative path without a leading slash is still a path; an unparseable URL is dropped", () => {
    expect(scrubUrl(undefined)).toBeUndefined();
    expect(scrubUrl("")).toBe("");
    expect(scrubUrl("app/entries/0b9c5f7e-1d2a-4c3b-9e8f-7a6b5c4d3e2f?x=1")).toBe("/app/entries/[id]");
    expect(scrubUrl("https://[not-a-host/app?q=walk")).toBeUndefined();
  });

  it("a transaction that can't be parsed becomes [redacted], never the raw text", () => {
    expect(scrubEvent({ transaction: `https://[not-a-host/${DIARY}` }).transaction).toBe(REDACTED);
  });

  it("URL tags that aren't strings are dropped; unknown tags never survive", () => {
    const e = scrubEvent({ tags: { url: 42, transaction: "/app/timeline/2026-10-18?q=x", diary: DIARY } });
    expect(e.tags).toEqual({ transaction: "/app/timeline/[date]" });
  });

  it("an event with nothing to scrub: no crash, empty breadcrumbs, nothing invented", () => {
    const e = scrubEvent({}) as Record<string, unknown>;
    expect(e).toEqual({ breadcrumbs: [] });
  });

  it("an exception with no value, mechanism or stack is kept as it is", () => {
    const e = scrubEvent({ exception: { values: [{ type: "TypeError" }] } });
    expect(e.exception?.values).toEqual([{ type: "TypeError" }]);
  });

  it("a breadcrumb's URL that isn't a string is dropped, never kept raw", () => {
    expect(scrubBreadcrumb({ category: "fetch", data: { url: { href: `/x?q=${DIARY}` }, method: "POST" } })).toEqual({ category: "fetch", data: { method: "POST" } });
  });

  it("a trace context without its keys keeps nothing but an empty trace", () => {
    const e = scrubEvent({ contexts: { trace: { data: { url: `/x?q=${DIARY}` } } } });
    expect(e.contexts).toEqual({ trace: {} });
  });
});
