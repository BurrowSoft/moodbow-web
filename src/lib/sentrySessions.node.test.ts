// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as SentryNode from "@sentry/node";
import { sentryOptions } from "@/sentry.shared";
import { withoutServerSessions } from "./sentrySessions";

// The real Node SDK, configured exactly as src/instrumentation.ts does, with
// a recording transport. @sentry/node's defaults include ProcessSession (a
// session per process, reported as crashed with "did" = user id on an
// unhandled error) and Http request sessions; neither may survive.
describe("Node SDK with our options", () => {
  it("installs no session integration and sends no session envelope or user id", { timeout: 30_000 }, async () => {
    const sent: string[] = [];
    const itemTypes: string[] = [];
    SentryNode.init({
      dsn: "https://public@o0.ingest.sentry.io/0",
      release: "test-release",
      ...sentryOptions,
      integrations: (defaults) => withoutServerSessions(defaults, () => SentryNode.httpIntegration({ sessions: false })),
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
    const installed = (SentryNode.getClient()?.getOptions().integrations ?? []).map((i) => i.name);
    expect(installed).toContain("Http");
    expect(installed.filter((n) => /Session/.test(n))).toEqual([]);

    // eslint-disable-next-line no-restricted-syntax -- simulating a forbidden call on purpose
    SentryNode.setUser({ id: "PROBEUSER-2", email: "jane@example.com" });
    // An unhandled error, like a route handler throwing: this is what marks
    // a process session as crashed.
    SentryNode.captureException(new Error("diary text PROBE-TEXT"), { mechanism: { type: "onunhandledrejection", handled: false } });
    await SentryNode.close(10_000);

    expect(itemTypes).toContain("event");
    expect(itemTypes).not.toContain("session");
    expect(itemTypes).not.toContain("sessions");
    const all = sent.join("\n");
    expect(all).not.toContain("PROBEUSER-2");
    expect(all).not.toContain("jane@example.com");
    expect(all).not.toContain("PROBE-TEXT");
  });
});
