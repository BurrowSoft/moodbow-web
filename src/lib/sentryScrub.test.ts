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
