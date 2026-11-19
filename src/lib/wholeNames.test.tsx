import { readdirSync, readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { helpArticles, renderArticle } from "./helpContent";
import { renderLegal } from "./legalContent";
import { HYPHEN_MIN, KEEP_TOGETHER_CLASS, LONG_NAMES, SupportAddress, supportAddressHtml, wholeNames, wholeNamesHtml, withSupportAddress, WHOLE_NAME_CLASS, WHOLE_NAMES } from "./wholeNames";
import { SUPPORT_EMAIL } from "./site";

const LOCALES = ["en", "es", "fr", "de", "it", "pt-br", "th"];
const walk = (o: Record<string, unknown>, p: string[] = []): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? walk(v as Record<string, unknown>, [...p, k]) : [[[...p, k].join("."), String(v)] as [string, string]]));
const messagesOf = (locale: string) => walk(JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")));
// What the markdown pages show, as written (content/legal and content/help, <locale>/<page>.md), comments left out.
const markdownSources = (): [string, string][] =>
  ["legal", "help"].flatMap((kind) =>
    readdirSync(`content/${kind}`).flatMap((locale) =>
      readdirSync(`content/${kind}/${locale}`)
        .filter((f) => f.endsWith(".md"))
        .map((f) => [`${kind}/${locale}/${f}`, readFileSync(`content/${kind}/${locale}/${f}`, "utf8").replace(/<!--[\s\S]*?-->/g, "")] as [string, string]),
    ),
  );

// Names stay whole everywhere the global large-text rule reaches (UX, 20 Nov, after "MOOD- / BOW" on Me's Plus banner).
// globals.css hyphenates only words of HYPHEN_MIN letters or more: a name whose words are all shorter can't break, wrapped
// or not. The LONG_NAMES have a longer word, so they're wrapped wherever they render, and every message holding one is
// listed below with where.
describe("names stay whole at large text", () => {
  it("globals.css and HYPHEN_MIN agree", () => {
    const min = Number(readFileSync("src/app/globals.css", "utf8").match(/hyphenate-limit-chars:\s*(\d+)\s+\d+\s+\d+/)?.[1]);
    expect(min).toBe(HYPHEN_MIN);
  });

  it("short names are safe by length; exactly these need wrapping", () => {
    expect([...LONG_NAMES]).toEqual(["Vitor Carvalho", "BurrowSoft", "Anthropic", "Supabase", "JavaScript", "Bluetooth", "TelefonSeelsorge"]);
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
      "me.meNoScript": "app/layout (the no-script line)",
      "meta.description": "metadata only",
      "common.burrowsoftAria": "an aria-label only",
    };
    for (const locale of LOCALES) {
      for (const [key, value] of messagesOf(locale)) if (LONG_NAMES.some((n) => value.includes(n))) expect(Object.keys(WRAPPED), `${locale}: ${key}`).toContain(key);
    }
  });

  // Brands stay whole too (UX, 20 Nov: Bluetooth, and any trademark met later, such as WhatsApp or Instagram). So a known
  // trademark of HYPHEN_MIN+ letters, or any camel-case word that long (BurrowSoft, JavaScript), that a message or a
  // markdown page shows is on WHOLE_NAMES, which the legal pages and Help wrap, and the test above makes messages wrap.
  it("every brand of 8+ letters a page shows is on WHOLE_NAMES", () => {
    const TRADEMARKS = ["Anthropic", "BurrowSoft", "Supabase", "JavaScript", "Bluetooth", "WhatsApp", "Instagram", "Facebook", "Snapchat", "LinkedIn", "Pinterest", "Telegram", "Cloudflare", "ElevenLabs", "Microsoft", "Mastercard", "HealthKit"];
    // Camel case: a capital right after a small letter, inside one word. Not a name in ICU or markup: a word right after
    // "{", "<" or "/" (an argument, a tag) or right before " {" (a select key, as "threeMonths {") is left out.
    const CAMEL = /(?<![{</\p{L}])\p{L}*\p{Ll}\p{Lu}\p{L}*(?!\p{L}|\s*\{)/gu;
    const listed = new Set(WHOLE_NAMES.flatMap((n) => n.split(" ")));
    const shown: [string, string][] = [...LOCALES.flatMap((l) => messagesOf(l).map(([k, v]) => [`${l}: ${k}`, v] as [string, string])), ...markdownSources()];
    expect(shown.length).toBeGreaterThan(1000);
    const missing = new Set<string>();
    for (const [where, text] of shown) {
      const brands = [...TRADEMARKS.filter((w) => text.includes(w)), ...[...text.matchAll(CAMEL)].map((m) => m[0])];
      for (const word of brands) if (word.length >= HYPHEN_MIN && !listed.has(word)) missing.add(`${word} (${where})`);
    }
    expect([...missing]).toEqual([]);
    // The check itself: a camel-case brand is found, an ICU select key and a tag name are not.
    expect("Share on WhatsApp now".match(CAMEL)).toEqual(["WhatsApp"]);
    expect("{range, select, threeMonths {these months}} <helpLink>Help</helpLink>".match(CAMEL)).toBeNull();
  });

  // The one place words of 7 letters may hyphenate too: the letter's "Open in" choices ("In 3 Monaten" at 300 % on a 320 px
  // phone, LettersEditor). A 7-letter name ("Moodbow") would hyphenate there, so none may hold one.
  it("the letter's months choices, which hyphenate from 7 letters, hold no name", () => {
    const shortNames = WHOLE_NAMES.flatMap((n) => n.split(" ")).filter((w) => w.length >= 7);
    for (const locale of LOCALES) {
      const letters = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).letters as Record<string, string>;
      for (const key of ["in1", "in3", "in6", "in12"]) {
        expect(letters[key], `${locale}: letters.${key}`).toBeTruthy();
        for (const name of shortNames) expect(letters[key], `${locale}: letters.${key}`).not.toContain(name);
      }
    }
    expect(readFileSync("src/app/[locale]/app/me/letters/LettersEditor.tsx", "utf8")).toContain("[hyphenate-limit-chars:7_3_3]");
  });

  it("Help wraps only the long names (the short ones read as plain text)", () => {
    expect(wholeNamesHtml("<p>Moodbow uses Anthropic.</p>", LONG_NAMES)).toBe(`<p>Moodbow uses <span class="${WHOLE_NAME_CLASS}">Anthropic</span>.</p>`);
  });

  it("every legal page and Help article wraps each long name it shows (every pending block shown)", () => {
    const pages: [string, string][] = [];
    for (const locale of readdirSync("content/legal")) {
      for (const file of readdirSync(`content/legal/${locale}`).filter((f) => f.endsWith(".md"))) {
        pages.push([`legal/${locale}/${file}`, renderLegal(readFileSync(`content/legal/${locale}/${file}`, "utf8"), () => true, null).html]);
      }
    }
    for (const locale of readdirSync("content/help")) {
      for (const article of helpArticles(locale)) pages.push([`help/${locale}/${article.slug}`, renderArticle(article, () => true)]);
    }
    expect(pages.length).toBeGreaterThan(20);
    for (const [where, html] of pages) {
      const text = html.replace(/<[^>]+>/g, "");
      for (const name of LONG_NAMES) {
        const wrapped = html.split(`<span class="${WHOLE_NAME_CLASS}">${name}</span>`).length - 1;
        // Each long word of the name, counted in the page's text, is inside a wrapped name: so a name broken over two
        // lines of the markdown ("Vitor" / "Carvalho") fails here too.
        for (const word of name.split(" ").filter((w) => w.length >= HYPHEN_MIN)) expect(text.split(word).length - 1, `${where}: ${word}`).toBe(wrapped);
      }
    }
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

// UX, 20 Nov (the Web Tester's fr/pt-BR sweep: "support@mood / bow.com" on six public pages at 320 px / 300 %): the
// address may end a line only after its "@", the domain stays whole, and the text is the plain address.
describe("the support address", () => {
  it("breaks only after its @, the domain kept whole, its text unchanged", () => {
    const { container } = render(
      <p>
        <SupportAddress />
      </p>,
    );
    expect(container.textContent).toBe(SUPPORT_EMAIL);
    // No no-wrap on the domain: it may still give way on a 160 px page rather than push it sideways (#410's CI).
    expect(container.querySelector("p")!.innerHTML).toBe("support@<wbr>moodbow.com");
  });
  it("goes in where a message names it, and nowhere else", () => {
    const { container } = render(<p>{withSupportAddress(`Écrivez à ${SUPPORT_EMAIL}.`)}</p>);
    expect(container.textContent).toBe(`Écrivez à ${SUPPORT_EMAIL}.`);
    expect(container.querySelectorAll("wbr")).toHaveLength(1);
    expect(withSupportAddress("No address here")).toBe("No address here");
  });
  it("in HTML: in the text, never in a mailto: link's address", () => {
    const html = `<p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> or ${SUPPORT_EMAIL}.</p>`;
    const shown = "support@<wbr>moodbow.com";
    expect(supportAddressHtml(html)).toBe(`<p>Email <a href="mailto:${SUPPORT_EMAIL}">${shown}</a> or ${shown}.</p>`);
  });
  it("every legal page and Help article that shows the address shows it that way", () => {
    for (const locale of LOCALES) {
      for (const article of helpArticles(locale)) expect(renderArticle(article, () => true), `${locale} ${article.slug}`).not.toMatch(new RegExp(`>[^<]*${SUPPORT_EMAIL}`));
    }
    for (const slug of ["privacy", "terms", "consumer-health-data"] as const) {
      const { html } = renderLegal(readFileSync(`content/legal/en/${slug}.md`, "utf8"), () => true, null);
      expect(html, slug).not.toMatch(new RegExp(`>[^<]*${SUPPORT_EMAIL}`));
    }
  });
  // A short word before it ("à", "a", "an") never ends a line alone: a no-break space, in every language.
  it("the two messages that name it have a no-break space before it", () => {
    for (const locale of LOCALES) {
      const m = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as { help: { helpIntro: string }; accountDeletion: { noAccess: string } };
      expect(m.help.helpIntro, `${locale} help.helpIntro`).toContain(`${String.fromCharCode(0xa0)}{email}`);
      expect(m.accountDeletion.noAccess, `${locale} accountDeletion.noAccess`).toContain(`${String.fromCharCode(0xa0)}<support>`);
    }
  });
});
