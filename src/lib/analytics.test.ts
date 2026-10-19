import { afterEach, describe, expect, it, vi } from "vitest";
import { NOT_FOUND_MARK, scrubEvent, scrubUrl } from "./analytics";

const W = "https://www.moodbow.com";

describe("scrubUrl (decision 79: page addresses only, nothing that identifies anyone)", () => {
  it("drops every query string and fragment", () => {
    expect(scrubUrl(`${W}/insights?range=month`)).toBe(`${W}/insights`);
    expect(scrubUrl(`${W}/email-confirmed?code=abc123&error_description=x#frag`)).toBe(`${W}/email-confirmed`);
    expect(scrubUrl(`${W}/?utm_source=ad`)).toBe(`${W}/`);
  });

  it("entry ids and days become [id] / [date]", () => {
    expect(scrubUrl(`${W}/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b`)).toBe(`${W}/app/entries/[id]`);
    expect(scrubUrl(`${W}/app/timeline/2026-10-02`)).toBe(`${W}/app/timeline/[date]`);
    expect(scrubUrl(`${W}/app/write?date=2026-10-01`)).toBe(`${W}/app/write`);
  });

  it("long opaque segments (tokens) never pass", () => {
    expect(scrubUrl(`${W}/x/a1b2c3d4e5f60718293a4b5c6d7e8f90`)).toBe(`${W}/x/[token]`);
  });

  it("nothing at all for the auth pages, with or without a locale", () => {
    expect(scrubUrl(`${W}/auth/confirm?token_hash=a1b2c3&type=recovery`)).toBeNull();
    expect(scrubUrl(`${W}/auth/reset-password`)).toBeNull();
    expect(scrubUrl(`${W}/th/auth/confirm?token_hash=a1b2`)).toBeNull();
  });

  it("ordinary pages stay as they are; garbage is dropped", () => {
    expect(scrubUrl(`${W}/privacy`)).toBe(`${W}/privacy`);
    expect(scrubUrl(`${W}/app/me`)).toBe(`${W}/app/me`);
    expect(scrubUrl("not a url")).toBeNull();
  });

  it("scrubEvent keeps the rest of the event, or drops it", () => {
    expect(scrubEvent({ type: "pageview", url: `${W}/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b?x=1` })).toEqual({ type: "pageview", url: `${W}/app/entries/[id]` });
    expect(scrubEvent({ type: "pageview", url: `${W}/auth/confirm` })).toBeNull();
  });
});

describe("scrubEvent on a not-found page (Web Tester, #21)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends nothing while the page is marked not found; normal again after", () => {
    const marked = { value: true };
    vi.stubGlobal("document", { querySelector: (sel: string) => (sel === `[${NOT_FOUND_MARK}]` && marked.value ? {} : null) });
    expect(scrubEvent({ type: "pageview", url: `${W}/help/some-typed-slug` })).toBeNull();
    marked.value = false;
    expect(scrubEvent({ type: "pageview", url: `${W}/help` })).toEqual({ type: "pageview", url: `${W}/help` });
  });
});
