import { afterEach, describe, expect, it } from "vitest";
import * as SentryBrowser from "@sentry/browser";
import { sentryOptions } from "@/sentry.shared";
import { withoutServerSessions, withoutSessions } from "./sentrySessions";

describe("withoutSessions / withoutServerSessions", () => {
  it("drops every integration whose name contains Session", () => {
    const names = withoutSessions([
      { name: "BrowserSession" },
      { name: "ProcessSession" },
      { name: "Breadcrumbs" },
      { name: "Dedupe" },
    ]).map((i) => i.name);
    expect(names).toEqual(["Breadcrumbs", "Dedupe"]);
  });

  it("on the server, also replaces Http with the session-less one", () => {
    const replacement = { name: "Http", sessions: false };
    const out = withoutServerSessions([{ name: "Console" }, { name: "ProcessSession" }, { name: "Http", sessions: true }], () => replacement);
    expect(out).toEqual([{ name: "Console" }, replacement]);
    expect(out[1]).toBe(replacement);
  });
});

// The real browser SDK with our options and a recording transport: even if
// a user were set (banned by lint, but simulated here), no session item and
// no user id may leave the browser in any envelope.
describe("browser SDK with our options", () => {
  afterEach(async () => {
    await SentryBrowser.close();
  });

  it("installs no session integration and sends no session envelope or user id", { timeout: 30_000 }, async () => {
    const sent: string[] = [];
    const itemTypes: string[] = [];
    SentryBrowser.init({
      dsn: "https://public@o0.ingest.sentry.io/0",
      release: "test-release",
      ...sentryOptions,
      integrations: withoutSessions,
      transport: () => ({
        send: async (envelope) => {
          const [, items] = envelope as unknown as [unknown, [{ type: string }, unknown][]];
          for (const [header] of items) itemTypes.push(header.type);
          sent.push(JSON.stringify(envelope));
          return {};
        },
        flush: async () => true,
      }),
    });
    const installed = (SentryBrowser.getClient()?.getOptions().integrations ?? []).map((i) => i.name);
    expect(installed.length).toBeGreaterThan(0);
    expect(installed.filter((n) => /Session/.test(n))).toEqual([]);

    // eslint-disable-next-line no-restricted-syntax -- simulating a forbidden call on purpose
    SentryBrowser.setUser({ id: "PROBEUSER-1", email: "jane@example.com" });
    SentryBrowser.captureException(new Error("diary text PROBE-TEXT"));
    await SentryBrowser.flush(10_000);

    expect(itemTypes).toContain("event");
    expect(itemTypes).not.toContain("session");
    expect(itemTypes).not.toContain("sessions");
    const all = sent.join("\n");
    expect(all).not.toContain("PROBEUSER-1");
    expect(all).not.toContain("jane@example.com");
    expect(all).not.toContain("PROBE-TEXT");
  });
});
