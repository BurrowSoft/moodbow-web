// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import es from "@/messages/es.json";
import { legalSource, stripComments } from "./legalContent";

// The Spanish has to say what the English says (decision 222): an English change blocks here until
// the Spanish follows. This checks structure and facts; a person compares the words.
const raw = (slug: string, locale: string) => readFileSync(path.join(process.cwd(), "content", "legal", locale, `${slug}.md`), "utf8").replace(/\r\n/g, "\n");
const NAMES = ["Vitor Ribeiro Carvalho", "BurrowSoft", "297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000", "support@moodbow.com", "moodbow.com", "Anthropic", "Supabase", "Amazon Web Services", "Vercel", "Resend", "Sentry", "Google Play", "App Store", "HTTPS", "PDPC", "Moodbow AI Lite", "AAIP"];
const SHAPES: Record<string, (text: string) => string[]> = {
  "pending blocks, in order": (s) => s.match(/\{\/?pending(:[a-z_|]+)?\}/g) ?? [],
  headings: (s) => s.match(/^#{2,3} /gm) ?? [],
  "numbered sections": (s) => s.match(/^### \d+/gm) ?? [],
  bullets: (s) => s.match(/^(\{pending:[a-z_]+\})?- /gm) ?? [],
  "table rows": (s) => s.match(/^(\{pending:[a-z_]+\})?\|/gm) ?? [],
  "bold runs": (s) => s.match(/\*\*/g) ?? [],
  lines: (s) => s.trim().split("\n").map((l) => (l.trim() === "" ? "blank" : "text")),
  numbers: (s) => (s.match(/\d+/g) ?? []).sort(),
  // In order: markdown link targets, bare addresses and emails, none of which translate.
  links: (s) => s.match(/\]\([^)]*\)|https?:\/\/[^\s)|]+|[\w.-]+@[\w.-]+\.[a-z]+/g) ?? [],
};
const count = (text: string, name: string) => text.split(name).length - 1;

describe.each(["privacy", "terms"])("Spanish %s against the English", (slug) => {
  const english = stripComments(legalSource(slug as "privacy", "en"));
  const spanish = stripComments(legalSource(slug as "privacy", "es"));
  it("translates this exact English: if this fails, the English changed, so update the Spanish and its en-sha256", () => {
    const hash = createHash("sha256").update(raw(slug, "en")).digest("hex");
    expect(raw(slug, "es").match(/en-sha256: ([0-9a-f]{64})/)?.[1]).toBe(hash);
  });
  it.each(Object.keys(SHAPES))("the same %s", (shape) => {
    expect(SHAPES[shape](spanish)).toEqual(SHAPES[shape](english));
  });
  it("the same names, as often", () => {
    for (const name of NAMES) expect(count(spanish, name), name).toBe(count(english, name));
  });
});

describe("the words for Moodbow's buttons match what the app shows in Spanish", () => {
  const text = stripComments(legalSource("privacy", "es")) + stripComments(legalSource("terms", "es"));
  it.each([
    [`${es.app.tabMe} → ${es.me.meExport}`],
    [`${es.app.tabMe} → ${es.me.meDelete}`],
    [`${es.app.tabMe} → ${es.ai.meAi}`],
    [`${es.app.tabMe} → ${es.me.meGetHelpNow}`],
  ])("%s", (words) => {
    expect(text).toContain(words);
  });
});
