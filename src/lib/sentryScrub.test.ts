import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from "./sentryScrub";

describe("scrubUrl", () => {
  it("keeps origin + path, drops query and fragment", () => {
    expect(scrubUrl("https://www.moodbow.com/th/email-confirmed?code=abc#access_token=secret")).toBe(
      "https://www.moodbow.com/th/email-confirmed",
    );
    expect(scrubUrl("/auth/confirm?token_hash=abc&type=signup")).toBe("/auth/confirm");
  });

  it("replaces record ids in the path", () => {
    expect(scrubUrl("/app/entries/0b9c5f7e-1d2a-4c3b-9e8f-7a6b5c4d3e2f/edit")).toBe("/app/entries/[id]/edit");
  });
});

describe("scrubText", () => {
  it("redacts emails, phone numbers, Thai IDs and URL queries in free text", () => {
    const out = scrubText(
      "failed for jane@example.com, call +66 81 234 5678, id 1-2345-67890-12-3 at https://x.supabase.co/rest/v1/entries?body=ilike.*sad*",
    );
    expect(out).not.toContain("jane@example.com");
    expect(out).not.toContain("234 5678");
    expect(out).not.toContain("67890");
    expect(out).not.toContain("sad");
    expect(out).toContain("[email]");
    expect(out).toContain("https://x.supabase.co/rest/v1/entries");
  });
});

describe("scrubEvent", () => {
  it("strips request data, user details, extra, spans and unsafe contexts", () => {
    const event = scrubEvent({
      request: {
        url: "https://www.moodbow.com/app?q=private",
        method: "POST",
        data: "my diary entry",
        headers: { cookie: "sb=1" },
        cookies: { sb: "1" },
      },
      user: { id: 42, email: "jane@example.com", ip_address: "1.2.3.4" },
      extra: { body: "my diary entry" },
      spans: [{ description: "GET /rest/v1/entries?body=x" }],
      contexts: {
        browser: { name: "Chrome" },
        nextjs: { request_path: "/app?q=private" },
        trace: { trace_id: "t", span_id: "s", data: { url: "https://x?y" } },
      },
      tags: { url: "https://www.moodbow.com/a?b=c", note: "mail jane@example.com" },
      exception: {
        values: [
          {
            value: "Bad input from jane@example.com",
            stacktrace: { frames: [{ context_line: "save('jane@example.com')", vars: { body: "secret" } }] },
          },
        ],
      },
    });
    expect(event.request).toEqual({ url: "https://www.moodbow.com/app", method: "POST" });
    expect(event.user).toEqual({ id: "42" });
    expect("extra" in event).toBe(false);
    expect("spans" in event).toBe(false);
    expect(event.contexts).toEqual({ browser: { name: "Chrome" }, trace: { trace_id: "t", span_id: "s" } });
    expect(event.tags).toEqual({ url: "https://www.moodbow.com/a", note: "mail [email]" });
    const ex = event.exception.values[0];
    expect(ex.value).toBe("Bad input from [email]");
    expect(ex.stacktrace.frames[0]).toEqual({ context_line: "save('[email]')" });
    expect(JSON.stringify(event)).not.toContain("diary");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console output and input breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "entry text" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.input", message: "textarea" })).toBeNull();
  });

  it("keeps only safe data keys, with URLs cut to their path", () => {
    expect(
      scrubBreadcrumb({
        category: "fetch",
        data: { url: "https://x.supabase.co/rest/v1/entries?select=*&body=eq.hi", method: "GET", status_code: 200, request_body: "hi" },
      }),
    ).toEqual({ category: "fetch", data: { url: "https://x.supabase.co/rest/v1/entries", method: "GET", status_code: 200 } });
  });
});
