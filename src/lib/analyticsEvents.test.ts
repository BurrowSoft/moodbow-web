import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@vercel/analytics", () => ({ track }));
const { countFromElement, countTap, isTapEvent, setTapsOn, TAP_CHOICES, TAP_EVENTS, validTapData } = await import("./analyticsEvents");

// Taps are a fixed name and nothing else (specs/analytics.md; UX & PM, 17 Nov).
// These tests read the source, so a new call can't slip text, ids or values in.

const SRC = join(__dirname, "..");
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const FILES = sources(SRC).map((path) => ({ path: relative(SRC, path).split("\\").join("/"), text: readFileSync(path, "utf8") }));
const ALL = (re: RegExp) => FILES.flatMap(({ path, text }) => [...text.matchAll(re)].map((m) => ({ path, m })));

describe("the event list", () => {
  it("snake_case names of at most 40 characters, each once", () => {
    for (const name of TAP_EVENTS) expect(name, name).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
    expect(new Set(TAP_EVENTS).size).toBe(TAP_EVENTS.length);
  });

  it("nothing about crises, helplines, calls or the safety plan (UX: never counted)", () => {
    for (const name of TAP_EVENTS) expect(name, name).not.toMatch(/crisis|helpline|call|emergency|safety|plan|mood|keyword/);
  });

  it("every listed name is used somewhere (no dead names)", () => {
    const used = new Set([...ALL(/countTap\("([a-z0-9_]+)"/g), ...ALL(/data-count="([a-z0-9_]+)"/g), ...ALL(/count="([a-z0-9_]+)"/g), ...ALL(/\? "([a-z0-9_]+)" : "([a-z0-9_]+)"/g)].flatMap(({ m }) => m.slice(1)));
    used.add("cta_store_play"); // PlayStoreLink's default
    for (const name of TAP_EVENTS) expect(used.has(name), name).toBe(true);
  });
});

describe("no free text can be sent (the source)", () => {
  it("countTap is called with a listed literal, and a second argument only for the choice events", () => {
    const calls = ALL(/countTap\(([^)]*)\)/g).filter(({ path }) => path !== "lib/analyticsEvents.ts");
    expect(calls.length).toBeGreaterThanOrEqual(14);
    for (const { path, m } of calls) {
      const args = m[1];
      const literal = /^"([a-z0-9_]+)"(, \{ (locale): next as Locale \})?$/.exec(args) ?? /^(purchased|goodThings) \? "([a-z0-9_]+)" : "([a-z0-9_]+)"$/.exec(args);
      expect(literal, `${path}: countTap(${args})`).not.toBeNull();
      const names = /^"/.test(args) ? [literal![1]] : [literal![2], literal![3]];
      for (const name of names) expect(isTapEvent(name), `${path}: ${name}`).toBe(true);
      if (literal![3] === "locale" || /, \{/.test(args)) expect(names[0]).toBe("language_switch");
    }
  });

  it("data-count is a listed literal (or PlayStoreLink's own prop), its choices only locale or range", () => {
    for (const { path, m } of ALL(/data-count="([^"]*)"/g).filter(({ path }) => path !== "lib/analyticsEvents.ts")) expect(isTapEvent(m[1]), `${path}: ${m[1]}`).toBe(true);
    for (const { path } of ALL(/data-count=\{/g)) expect(path).toBe("components/PlayStoreLink.tsx");
    for (const { path, m } of ALL(/ count="([^"]*)"/g)) expect(isTapEvent(m[1]), `${path}: ${m[1]}`).toBe(true);
    for (const { path, m } of ALL(/data-count-([a-z]+)=/g)) {
      expect(["locale", "range"], `${path}: data-count-${m[1]}`).toContain(m[1]);
    }
    expect(ALL(/data-count-locale=\{l\}/g).map(({ path }) => path)).toEqual(["components/LanguageSwitcher.tsx"]);
    expect(ALL(/data-count-range=\{r\}/g).map(({ path }) => path).sort()).toEqual(["app/[locale]/app/insights/InsightsView.tsx", "app/[locale]/app/insights/PlusInsights.tsx"]);
  });

  it("no other way to send: track() only here, and never identify, group or a cookie", () => {
    for (const { path } of ALL(/\btrack\(/g)) expect(path).toBe("lib/analyticsEvents.ts");
    for (const { path } of ALL(/from "@vercel\/analytics(\/[a-z]+)?"/g)) expect(["lib/analyticsEvents.ts", "components/VisitCounts.tsx"]).toContain(path);
    expect(ALL(/window\.va\b|\bvaq\b|\bva\(|"identify"|"enableCookie"|__va_attribution/g)).toEqual([]);
  });

  it("no tap inside the safety plan, the crisis card or the helpline lines", () => {
    const off = /SafetyPlan|safety-plan\/|HelpNowLines|crisis/i;
    for (const { path } of [...ALL(/countTap\(/g), ...ALL(/data-count/g)]) {
      if (path === "lib/analyticsEvents.ts") continue;
      expect(off.test(path), path).toBe(false);
    }
    // SafetyCard.tsx holds GetHelpNow: its two links are the only counted elements there.
    const card = FILES.find((f) => f.path === "components/SafetyCard.tsx")!.text;
    expect([...card.matchAll(/data-count="([a-z_]+)"/g)].map((m) => m[1])).toEqual(["cta_help_open", "cta_help_open"]);
    expect(card).not.toMatch(/countTap/);
  });
});

describe("countTap at run time", () => {
  beforeEach(() => {
    track.mockClear();
    setTapsOn(true);
  });

  it("off (no counter on the page): nothing", () => {
    setTapsOn(false);
    countTap("entry_saved");
    expect(track).not.toHaveBeenCalled();
  });

  it("a name only, never anything slipped in beside it", () => {
    countTap("entry_saved");
    expect(track).toHaveBeenLastCalledWith("entry_saved");
    (countTap as (...a: unknown[]) => void)("entry_saved", { text: "dear diary" });
    (countTap as (...a: unknown[]) => void)("not_listed");
    (countTap as (...a: unknown[]) => void)("language_switch");
    (countTap as (...a: unknown[]) => void)("language_switch", { locale: "fr", mood: 1 });
    expect(track).toHaveBeenCalledTimes(1);
    countTap("language_switch", { locale: "pt-br" });
    expect(track).toHaveBeenLastCalledWith("language_switch", { locale: "pt-br" });
  });

  it("the types refuse a name off the list or a missing choice", () => {
    // @ts-expect-error not on the list
    countTap("crisis_detected");
    // @ts-expect-error language_switch needs its locale
    countTap("language_switch");
    // @ts-expect-error a value outside the locales
    countTap("language_switch", { locale: "xx" });
    // @ts-expect-error a name-only event takes nothing more
    countTap("entry_saved", { text: "x" });
    expect(track).not.toHaveBeenCalled();
  });

  it("validTapData: exactly the allowed choice, or nothing", () => {
    expect(validTapData("entry_saved", undefined)).toBe(true);
    expect(validTapData("entry_saved", {})).toBe(false);
    expect(validTapData("insights_range", { range: "year" })).toBe(true);
    expect(validTapData("insights_range", { range: "year", extra: "1" })).toBe(false);
    expect(Object.keys(TAP_CHOICES).sort()).toEqual(["insights_range", "language_switch"]);
  });

  it("data-count on a server-rendered element, read at the tap", () => {
    const outer = document.createElement("a");
    outer.setAttribute("data-count", "insights_range");
    outer.setAttribute("data-count-range", "month");
    outer.innerHTML = "<span>Month</span>";
    countFromElement(outer.querySelector("span"));
    expect(track).toHaveBeenLastCalledWith("insights_range", { range: "month" });
    countFromElement(null);
    countFromElement(document.createElement("div"));
    expect(track).toHaveBeenCalledTimes(1);
  });
});
