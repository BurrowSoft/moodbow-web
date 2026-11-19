import { afterEach, describe, expect, it, vi } from "vitest";
import { isCountedPage, NOT_FOUND_MARK, scrubEvent, scrubUrl } from "./analytics";

const W = "https://www.moodbow.com";

describe("scrubUrl (decision 79, specs/analytics.md: page addresses only, nothing that identifies anyone)", () => {
  it("drops every query string and fragment, except our own three campaign labels (UX)", () => {
    expect(scrubUrl(`${W}/app/insights?range=month`)).toBe(`${W}/app/insights`);
    expect(scrubUrl(`${W}/email-confirmed?code=abc123&error_description=x#frag`)).toBe(`${W}/email-confirmed`);
    expect(scrubUrl(`${W}/?utm_source=ad`)).toBe(`${W}/?utm_source=ad`);
    expect(scrubUrl(`${W}/?utm_campaign=launch&utm_source=ig&utm_term=x&gclid=1#f`)).toBe(`${W}/?utm_source=ig&utm_campaign=launch`);
    expect(scrubUrl(`${W}/?utm_source=a%40b.com`)).toBe(`${W}/`);
  });

  it("never the country (UX Q6: it's the person's own profile country) or the back-link", () => {
    expect(scrubUrl(`${W}/help/get-help-now?country=TH`)).toBe(`${W}/help/get-help-now`);
    expect(scrubUrl(`${W}/fr/help/get-help-now?country=FR&utm_source=ig`)).toBe(`${W}/fr/help/get-help-now?utm_source=ig`);
    expect(scrubUrl(`${W}/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b?from=/app/timeline/2026-10-02`)).toBe(`${W}/app/entries/[id]`);
  });

  it("entry ids, days and months become [id] / [date] / [month]", () => {
    expect(scrubUrl(`${W}/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b`)).toBe(`${W}/app/entries/[id]`);
    expect(scrubUrl(`${W}/app/timeline/2026-10-02`)).toBe(`${W}/app/timeline/[date]`);
    expect(scrubUrl(`${W}/app/print/2026-11`)).toBe(`${W}/app/print/[month]`);
    expect(scrubUrl(`${W}/app/write?date=2026-10-01`)).toBe(`${W}/app/write`);
  });

  it("long opaque segments (tokens) never pass; anything that isn't one of our page names becomes [other]", () => {
    expect(scrubUrl(`${W}/x/a1b2c3d4e5f60718293a4b5c6d7e8f90`)).toBe(`${W}/x/[token]`);
    expect(scrubUrl(`${W}/help/Dear%20diary%20I%20feel`)).toBe(`${W}/help/[other]`);
    expect(scrubUrl(`${W}/help/someone@example.com`)).toBe(`${W}/help/[other]`);
    expect(scrubUrl(`${W}/help/%E0%B8%A5%E0%B8%9A`)).toBe(`${W}/help/[other]`);
    expect(scrubUrl(`${W}/help/%E0%A4%A`)).toBeNull();
  });

  it("our page names stay, long ones included; scrubbing twice changes nothing", () => {
    expect(scrubUrl(`${W}/consumer-health-data`)).toBe(`${W}/consumer-health-data`);
    expect(scrubUrl(`${W}/pt-br/help/keyboard-shortcuts`)).toBe(`${W}/pt-br/help/keyboard-shortcuts`);
    expect(scrubUrl(`${W}/app/me/toolbox/breathing`)).toBe(`${W}/app/me/toolbox/breathing`);
    const once = scrubUrl(`${W}/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b`)!;
    expect(scrubUrl(once)).toBe(once);
    expect(scrubUrl(`${W}/app/print/%5Bmonth%5D`)).toBe(`${W}/app/print/[month]`);
  });

  it("nothing at all for the auth email-link pages, with or without a locale", () => {
    expect(scrubUrl(`${W}/auth/confirm?token_hash=a1b2c3&type=recovery`)).toBeNull();
    expect(scrubUrl(`${W}/auth/reset-password`)).toBeNull();
    expect(scrubUrl(`${W}/th/auth/confirm?token_hash=a1b2`)).toBeNull();
  });

  it("the sign-in and sign-up pages count as bare routes (UX Q4), never with a token or query", () => {
    expect(scrubUrl(`${W}/sign-in?next=/app/me&email=a@b.c`)).toBe(`${W}/sign-in`);
    expect(scrubUrl(`${W}/es/sign-up#access_token=x`)).toBe(`${W}/es/sign-up`);
    expect(scrubUrl(`${W}/forgot-password`)).toBe(`${W}/forgot-password`);
  });

  it("never the safety plan (UX): any locale, any case, any page under it", () => {
    for (const p of ["/app/me/safety-plan", "/th/app/me/safety-plan", "/app/me/safety-plan/edit", "/APP/me/Safety-Plan", "/pt-BR/app/me/safety-plan?x=1"]) {
      expect(isCountedPage(new URL(`${W}${p}`).pathname), p).toBe(false);
      expect(scrubUrl(`${W}${p}`), p).toBeNull();
    }
    // The public help article about it is an ordinary page.
    expect(scrubUrl(`${W}/help/safety-plan`)).toBe(`${W}/help/safety-plan`);
  });

  // 1.4 G (UX): a shared week is a third party's visit, never counted, in any locale or case.
  it("never a shared week", () => {
    for (const p of ["/s", "/de/s", "/S", "/pt-BR/s"]) {
      expect(isCountedPage(new URL(`${W}${p}`).pathname), p).toBe(false);
      expect(scrubUrl(`${W}${p}`), p).toBeNull();
    }
  });

  it("ordinary pages stay as they are; garbage is dropped", () => {
    expect(scrubUrl(`${W}/privacy`)).toBe(`${W}/privacy`);
    expect(scrubUrl(`${W}/app/me`)).toBe(`${W}/app/me`);
    expect(scrubUrl("not a url")).toBeNull();
  });
});

describe("scrubEvent: page views", () => {
  it("keeps the rest of the event, or drops it", () => {
    expect(scrubEvent({ type: "pageview", url: `${W}/help/getting-started?x=1#f` })).toEqual({ type: "pageview", url: `${W}/help/getting-started` });
    expect(scrubEvent({ type: "pageview", url: `${W}/auth/confirm` })).toBeNull();
    expect(scrubEvent({ type: "pageview", url: `${W}/app/me/safety-plan` })).toBeNull();
  });

  it("the journal counts now (UX Q2), by its scrubbed address", () => {
    expect(scrubEvent({ type: "pageview", url: `${W}/th/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b?from=x` })).toEqual({ type: "pageview", url: `${W}/th/app/entries/[id]` });
  });
});

describe("scrubEvent: taps (a name from the closed list, and nothing else)", () => {
  const tap = (payload: unknown, url = `${W}/app`) => scrubEvent({ type: "event", url, payload });

  it("a listed name, with its scrubbed address", () => {
    expect(tap({ name: "entry_saved" }, `${W}/app/entries/3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b?from=x`)).toEqual({ type: "event", url: `${W}/app/entries/[id]`, payload: { name: "entry_saved" } });
    expect(tap({ name: "cta_help_open", data: undefined })).toEqual({ type: "event", url: `${W}/app`, payload: { name: "cta_help_open" } });
  });

  it("an unknown name, or any data on a name-only event: dropped", () => {
    expect(tap({ name: "crisis_detected" })).toBeNull();
    expect(tap({ name: "help_call_helpline" })).toBeNull();
    expect(tap({ name: "checkin_saved", data: { mood: 2 } })).toBeNull();
    expect(tap({ name: "entry_saved", data: { text: "dear diary" } })).toBeNull();
    expect(tap({ name: "entry_saved", data: {} })).toBeNull();
    expect(tap(undefined)).toBeNull();
    expect(tap({})).toBeNull();
  });

  it("the two choice events: exactly their one fixed value", () => {
    expect(tap({ name: "language_switch", data: { locale: "fr" } })).toEqual({ type: "event", url: `${W}/app`, payload: { name: "language_switch", data: { locale: "fr" } } });
    expect(tap({ name: "insights_range", data: { range: "3months" } })?.payload).toEqual({ name: "insights_range", data: { range: "3months" } });
    expect(tap({ name: "language_switch", data: { locale: "klingon" } })).toBeNull();
    expect(tap({ name: "language_switch" })).toBeNull();
    expect(tap({ name: "language_switch", data: { locale: "fr", email: "a@b.c" } })).toBeNull();
    expect(tap({ name: "insights_range", data: { range: 30 } })).toBeNull();
  });

  it("a tap on the safety plan's pages is never sent, the help button's included", () => {
    expect(tap({ name: "cta_help_open" }, `${W}/app/me/safety-plan`)).toBeNull();
    expect(tap({ name: "cta_help_open" }, `${W}/auth/confirm`)).toBeNull();
  });

  it("another event type is dropped", () => {
    expect(scrubEvent({ type: "identify" as "event", url: `${W}/app`, payload: { name: "entry_saved" } })).toBeNull();
  });
});

describe("scrubEvent on a not-found page (Web Tester, #21)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends nothing while the page is marked not found; normal again after", () => {
    const marked = { value: true };
    vi.stubGlobal("document", { querySelector: (sel: string) => (sel === `[${NOT_FOUND_MARK}]` && marked.value ? {} : null) });
    expect(scrubEvent({ type: "pageview", url: `${W}/help/some-typed-slug` })).toBeNull();
    expect(scrubEvent({ type: "event", url: `${W}/help/some-typed-slug`, payload: { name: "cta_help_open" } })).toBeNull();
    marked.value = false;
    expect(scrubEvent({ type: "pageview", url: `${W}/help` })).toEqual({ type: "pageview", url: `${W}/help` });
  });
});
