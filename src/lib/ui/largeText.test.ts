// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accountDeletionTextLocale } from "../accountDeletion";
import { TOPIC_MESSAGE_KEYS, TOPICS } from "../helpContent";
import { dialogButton } from "./dialogButton";
import { BO_HEADING, DAY_ADD_ENTRY, LARGE_TEXT_CAP, LOCKED_ROW_LABEL, ME_LOCKED_ROW, NAMES_FIT, WEEK_SUMMARY } from "./largeText";

// UX, 20 Nov (option A, after the Web Tester's fr/pt-BR sweep at 320 px / 300 %). The layout itself is checked in a
// real browser (e2e/large-text.spec.ts); these pin the pieces it relies on.
const LOCALES = ["en", "fr", "es", "pt-br", "de", "it", "th"];
const css = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ");

describe("decision 231's cap where words were cut", () => {
  it("stops at 10vw, never under 32 px, in em (the normal size is unchanged), and lets names stay whole", () => {
    expect(LARGE_TEXT_CAP).toBe(`${NAMES_FIT} [font-size:min(1em,max(10vw,32px))]`);
    for (const [name, classes] of Object.entries({ DAY_ADD_ENTRY, LOCKED_ROW_LABEL, WEEK_SUMMARY, dialogButton: dialogButton(), primary: dialogButton(true) })) {
      expect(classes, name).toContain(LARGE_TEXT_CAP);
    }
    expect(BO_HEADING).toContain(NAMES_FIT);
    expect(BO_HEADING).toContain("max-[13em]:basis-full");
  });
  it("the day page's pill and Me's locked row space in px, so large text doesn't narrow their words' line", () => {
    expect(DAY_ADD_ENTRY).toContain("px-[32px]");
    expect(DAY_ADD_ENTRY).not.toMatch(/\bpx-8\b/);
    expect(ME_LOCKED_ROW).toContain("gap-[12px]");
  });
  it("globals.css: a name inside the cap never takes an emergency break; Share's days are one letter under the hyphen rule's query", () => {
    expect(css).toContain(".names-fit .whole-name { overflow-wrap: normal; }");
    expect(css).toContain("@media (max-width: 13em) { body { hyphens: auto; hyphenate-limit-chars: 8 3 3;");
    expect(css).toContain('[data-day-form="narrow"] { display: none; } @media (max-width: 13em) { [data-day-form="short"] { display: none; } [data-day-form="narrow"] { display: inline; } }');
  });
});

// Every class string with rounded-full (a pill or a round button) spaces its sides in px: rem spacing grew 3x at
// 300 % and left the words a sliver ("Ajo / uter / une / not / e"). Vertical spacing may stay in rem.
describe("pills and buttons space their sides in px", () => {
  it("no rounded-full class string in src has a rem px-, ps-, pe-, gap- or gap-x- (any variant)", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) files.push(p);
      }
    };
    walk("src");
    const rem: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const segment of line.split(/["'`]/)) {
            if (!segment.includes("rounded-full")) continue;
            for (const token of segment.split(/[\s{}()$]+/)) if (/^(?:[a-z0-9-]+:)*(?:px|ps|pe|gap|gap-x)-[0-9.]+$/.test(token)) rem.push(`${file}:${i + 1} ${token}`);
          }
        });
    }
    expect(rem).toEqual([]);
  });
});

describe("Help's topics in each language (UX, 20 Nov: \"Basics\" and \"Help\" were English on /fr/help)", () => {
  it("every topic has its name in every language, and French ones aren't the English ids", () => {
    expect(Object.keys(TOPIC_MESSAGE_KEYS).sort()).toEqual([...TOPICS].sort());
    for (const locale of LOCALES) {
      const help = (JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as { help: Record<string, string> }).help;
      for (const key of Object.values(TOPIC_MESSAGE_KEYS)) expect(help[key]?.trim(), `${locale} help.${key}`).toBeTruthy();
      if (locale === "fr") for (const topic of TOPICS.filter((t) => t !== "AI")) expect(help[TOPIC_MESSAGE_KEYS[topic]], topic).not.toBe(topic);
    }
  });
});

describe("/account-deletion is a help page (UX, 20 Nov)", () => {
  it("each live language shows its own words; it and th show the English until they go live", () => {
    for (const locale of ["en", "fr", "es", "pt-br", "de"]) expect(accountDeletionTextLocale(locale)).toBe(locale);
    for (const locale of ["it", "th"]) expect(accountDeletionTextLocale(locale)).toBe("en");
  });
});
