import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { previewBypassState, usesPreviewBypass } from "../../e2e/previewBypass";

// The bypass secret reaches one host, once, and never sits on a browser's requests (decision 237).
const SECRET = "not-a-real-secret";
const PREVIEW = "https://moodbow-abc-burrowsoft.vercel.app";
const answer = (cookies: string[], status = 200) => vi.fn(async () => ({ status, headers: { getSetCookie: () => cookies } }) as unknown as Response);

describe("the Preview bypass", () => {
  it("is only for a https Vercel Preview, and only with a secret", () => {
    expect(usesPreviewBypass(PREVIEW, SECRET)).toBe(true);
    expect(usesPreviewBypass(PREVIEW, undefined)).toBe(false);
    expect(usesPreviewBypass("http://localhost:3000", SECRET)).toBe(false);
    expect(usesPreviewBypass("https://www.moodbow.com", SECRET)).toBe(false);
    expect(usesPreviewBypass("http://moodbow-abc.vercel.app", SECRET)).toBe(false);
    expect(usesPreviewBypass("https://moodbow.vercel.app.example.com", SECRET)).toBe(false);
    expect(usesPreviewBypass("https://evilvercel.app", SECRET)).toBe(false);
  });

  it("makes one request, to that host's root, and doesn't follow a redirect", async () => {
    const fetcher = answer(["_vercel_jwt=abc; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600"]);
    await previewBypassState(`${PREVIEW}/some/page?x=1`, SECRET, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PREVIEW}/`);
    expect(init.redirect).toBe("manual");
  });

  it("the browser's state holds the host-scoped cookie and never the secret", async () => {
    const state = await previewBypassState(PREVIEW, SECRET, answer(["_vercel_jwt=abc=d; Path=/; Secure; HttpOnly; SameSite=None"]));
    expect(state.cookies).toEqual([{ name: "_vercel_jwt", value: "abc=d", domain: new URL(PREVIEW).hostname, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "None" }]);
    expect(JSON.stringify(state)).not.toContain(SECRET);
  });

  it("no cookie is a plain error that doesn't name the secret, and another host is refused before any request", async () => {
    await expect(previewBypassState(PREVIEW, SECRET, answer([], 401))).rejects.toThrow("HTTP 401");
    await expect(previewBypassState(PREVIEW, SECRET, answer([], 401))).rejects.not.toThrow(SECRET);
    const fetcher = answer([]);
    await expect(previewBypassState("https://www.moodbow.com", SECRET, fetcher)).rejects.toThrow("Preview only");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("no Playwright config sends it as a header", () => {
    for (const file of ["playwright.config.ts", "playwright.journey.config.ts", "playwright.perf.config.ts"]) {
      const config = readFileSync(file, "utf8");
      expect(config, file).not.toContain("extraHTTPHeaders");
      expect(config, file).not.toContain("x-vercel-protection-bypass");
    }
  });
});
