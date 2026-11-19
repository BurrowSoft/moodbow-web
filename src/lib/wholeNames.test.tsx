import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HYPHEN_MIN, KEEP_TOGETHER_CLASS, LONG_NAMES, wholeNames, wholeNamesHtml, WHOLE_NAME_CLASS } from "./wholeNames";

// Names stay whole everywhere the global large-text rule reaches (UX, 20 Nov, after "MOOD- / BOW" on Me's Plus banner).
// globals.css hyphenates only words of HYPHEN_MIN letters or more: a name whose words are all shorter can't break, wrapped
// or not. The LONG_NAMES have a longer word, so they're wrapped wherever they render, and every message holding one is
// listed below with where.
describe("names stay whole at large text", () => {
  it("globals.css and HYPHEN_MIN agree", () => {
    const min = Number(readFileSync("src/app/globals.css", "utf8").match(/hyphenate-limit-chars:\s*(\d+)\s+\d+\s+\d+/)?.[1]);
    expect(min).toBe(HYPHEN_MIN);
  });

  it("short names are safe by length; exactly three need wrapping", () => {
    expect([...LONG_NAMES]).toEqual(["Vitor Carvalho", "BurrowSoft", "Anthropic"]);
    for (const word of ["Moodbow", "Plus", "AI", "Lite", "Stripe", "Google", "Play", "App", "Store"]) expect(word.length, word).toBeLessThan(HYPHEN_MIN);
  });

  it("every message holding a long name is rendered through wholeNames, or never shown as page text", () => {
    const WRAPPED: Record<string, string> = {
      "common.burrowsoftProduct": "Footer",
      "common.copyright": "Footer",
      "onboarding.consentNotice": "consent/page, sign-up/page",
      "ai.consentAiBody": "AiSettings, ConsentForm, SignUpForm",
      "bo.consentBody": "BoConsent",
      "bo.journalSwitchNote": "BoMeRow",
      "bo.pictureConsentBody": "BoConversation",
      "meta.description": "metadata only",
      "common.burrowsoftAria": "an aria-label only",
    };
    const walk = (o: Record<string, unknown>, p: string[] = []): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? walk(v as Record<string, unknown>, [...p, k]) : [[[...p, k].join("."), String(v)] as [string, string]]));
    for (const locale of ["en", "es", "fr", "de", "it", "pt-br", "th"]) {
      const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"));
      for (const [key, value] of walk(messages)) if (LONG_NAMES.some((n) => value.includes(n))) expect(Object.keys(WRAPPED), `${locale}: ${key}`).toContain(key);
    }
  });

  it("Help wraps only the long names (the short ones read as plain text)", () => {
    expect(wholeNamesHtml("<p>Moodbow uses Anthropic.</p>", LONG_NAMES)).toBe(`<p>Moodbow uses <span class="${WHOLE_NAME_CLASS}">Anthropic</span>.</p>`);
  });
});

describe("names never hyphenate", () => {
  it("wraps each name in text, and leaves the words around it as they were", () => {
    const { container } = render(<p>{wholeNames("Moodbow is run by Vitor Carvalho, trading as BurrowSoft, Thailand.")}</p>);
    expect(container.textContent).toBe("Moodbow is run by Vitor Carvalho, trading as BurrowSoft, Thailand.");
    expect([...container.querySelectorAll("span")].map((s) => [s.textContent, s.className])).toEqual([
      ["Moodbow", WHOLE_NAME_CLASS],
      ["Vitor Carvalho", WHOLE_NAME_CLASS],
      ["BurrowSoft", WHOLE_NAME_CLASS],
    ]);
  });
  it("leaves text without a name as plain text, and lowercase addresses alone", () => {
    expect(wholeNames("Email support@moodbow.com.")).toBe("Email support@moodbow.com.");
  });
  it("in HTML, only between tags: an address or attribute keeps its words", () => {
    const html = '<p>Vitor Carvalho at <a href="https://www.moodbow.com/Moodbow">Moodbow</a></p>';
    expect(wholeNamesHtml(html)).toBe(
      `<p><span class="${WHOLE_NAME_CLASS}">Vitor Carvalho</span> at <a href="https://www.moodbow.com/Moodbow"><span class="${WHOLE_NAME_CLASS}">Moodbow</span></a></p>`,
    );
  });
});

describe("a suspended compound stays on one line (German: 'und -Berichte')", () => {
  it("wraps the word that starts with a hyphen, and only that one; the text is unchanged", () => {
    const { container } = render(<p>{wholeNames("KI-Reflexionen und -Berichte (optional)")}</p>);
    expect(container.textContent).toBe("KI-Reflexionen und -Berichte (optional)");
    expect([...container.querySelectorAll("span")].map((s) => [s.textContent, s.className])).toEqual([["-Berichte", KEEP_TOGETHER_CLASS]]);
  });
  it("leaves a hyphen inside a word, a dash between words, and other languages alone", () => {
    expect(wholeNames("A 10-second check-in")).toBe("A 10-second check-in");
    expect(wholeNames("Today - a quiet day")).toBe("Today - a quiet day");
    expect(wholeNames("AI reflections and reports (optional)")).toBe("AI reflections and reports (optional)");
  });
  it("works beside a name", () => {
    const { container } = render(<p>{wholeNames("Moodbow-Tipps und -Berichte")}</p>);
    expect([...container.querySelectorAll("span")].map((s) => s.textContent)).toEqual(["Moodbow", "-Berichte"]);
  });
});
