// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildCsp, newNonce, sentryReportUri } from "./csp";

const ENV = { supabaseUrl: "https://abc.supabase.co", sentryDsn: "https://pubkey@o123.ingest.sentry.io/456", vercelEnv: "production" };
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))?.slice(name.length + 1).split(" ") ?? [];

describe("buildCsp (audit A1)", () => {
  it("scripts: only ours and this request's nonce; no unsafe-inline or eval", () => {
    const csp = buildCsp("N0nce==", ENV);
    expect(directive(csp, "script-src")).toEqual(["'self'", "'nonce-N0nce=='", "'strict-dynamic'"]);
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("connections: us, Supabase (https + wss) and Sentry's ingest; nothing else", () => {
    expect(directive(buildCsp("n", ENV), "connect-src")).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co", "https://o123.ingest.sentry.io"]);
  });

  it("no framing, no plugins, base and forms only to us", () => {
    const csp = buildCsp("n", ENV);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "frame-src")).toEqual(["'none'"]);
  });

  it("the share card's canvas: images from data: and blob:", () => {
    expect(directive(buildCsp("n", ENV), "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("violations go to Sentry's security endpoint", () => {
    expect(directive(buildCsp("n", ENV), "report-uri")).toEqual(["https://o123.ingest.sentry.io/api/456/security/?sentry_key=pubkey"]);
    expect(sentryReportUri("not a url")).toBeNull();
    expect(sentryReportUri(undefined)).toBeNull();
  });

  it("without Supabase or Sentry configured: just us, no report-uri", () => {
    const csp = buildCsp("n", {});
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(csp).not.toContain("report-uri");
  });

  it("Previews allow Vercel's toolbar; Production doesn't", () => {
    const preview = buildCsp("n", { ...ENV, vercelEnv: "preview" });
    expect(directive(preview, "script-src")).toContain("https://vercel.live");
    expect(directive(preview, "frame-src")).toEqual(["https://vercel.live"]);
    expect(buildCsp("n", ENV)).not.toContain("vercel.live");
  });
});

describe("newNonce", () => {
  it("is fresh each time, base64 of 16 bytes", () => {
    const a = newNonce();
    expect(a).not.toBe(newNonce());
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });
});
