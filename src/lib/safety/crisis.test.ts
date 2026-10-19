// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flagsCrisis, normalizeForCrisis, type CrisisKeywords } from "./crisis";
import { CRISIS_KEYWORDS } from "./keywords";

// The after-save check against UX's rules (specs/crisis-keywords-1.0.md,
// decision 125), with a small list in the contract's shape; the contract's
// own fixture runs below once content/contracts/crisis-keywords.json is
// synced.
const LIST: CrisisKeywords = {
  version: 1,
  languages: {
    en: { match: "word", phrases: ["kill myself", "dont want to live", "suicidal", "want to die"] },
    pt: { match: "word", phrases: ["não quero viver"] },
    th: { match: "substring", phrases: ["อยากตาย", "ไม่อยากอยู่แล้ว"] },
  },
};

describe("normalizeForCrisis", () => {
  it("NFKC, lowercase, curly and straight apostrophes removed, separators to one space", () => {
    expect(normalizeForCrisis("I DON’T  want—to\nlive!!", true)).toBe("i dont want to live");
    expect(normalizeForCrisis("ｆｕｌｌｗｉｄｔｈ", true)).toBe("fullwidth");
  });
  it("diacritics stripped for Latin lists only, never Thai marks", () => {
    expect(normalizeForCrisis("Não quero viver", true)).toBe("nao quero viver");
    expect(normalizeForCrisis("ไม่อยากอยู่แล้ว", false)).toBe("ไม่อยากอยู่แล้ว");
  });
});

describe("flagsCrisis", () => {
  it("whole words for Latin lists; everyday hyperbole doesn't match", () => {
    expect(flagsCrisis("Some days I just want to die.", LIST)).toBe(true);
    expect(flagsCrisis("I don't want to live like this", LIST)).toBe(true);
    expect(flagsCrisis("Feeling SUICIDAL again", LIST)).toBe(true);
    expect(flagsCrisis("This deadline will kill me.", LIST)).toBe(false);
    expect(flagsCrisis("I could killmyself laughing", LIST)).toBe(false);
    expect(flagsCrisis("dont want to lives", LIST)).toBe(false);
  });
  it("every list whatever the UI language; accents optional", () => {
    expect(flagsCrisis("nao quero viver mais", LIST)).toBe(true);
    expect(flagsCrisis("Não quero viver", LIST)).toBe(true);
  });
  it("Thai: substrings, marks kept", () => {
    expect(flagsCrisis("วันนี้อยากตายมาก", LIST)).toBe(true);
    expect(flagsCrisis("วันนี้ไปเดินเล่นที่สวน", LIST)).toBe(false);
  });
  it("no list (the contract not synced yet) or an empty entry: never a match", () => {
    expect(flagsCrisis("I want to die", null)).toBe(false);
    expect(flagsCrisis("   ", LIST)).toBe(false);
  });
});

// The shared fixture (app and web run the same one), once synced.
const CONTRACT = join(process.cwd(), "content", "contracts", "crisis-keywords.json");
describe.runIf(existsSync(CONTRACT))("the contract's fixture", () => {
  const load = () => JSON.parse(readFileSync(CONTRACT, "utf8")) as CrisisKeywords & { fixture: { should_flag: string[]; should_not_flag: string[] } };
  it("flags every should_flag and none of should_not_flag", () => {
    const contract = load();
    for (const text of contract.fixture.should_flag) expect(flagsCrisis(text, contract), text).toBe(true);
    for (const text of contract.fixture.should_not_flag) expect(flagsCrisis(text, contract), text).toBe(false);
  });
  it("the app uses it", () => {
    expect(CRISIS_KEYWORDS).not.toBeNull();
  });
});
