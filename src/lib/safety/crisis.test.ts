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
  // Rule 7 (contract v2, specs/crisis-keywords-1.0.md): a German compound
  // puts the word anywhere, so a stem matches inside words.
  it("stems match inside a word on either side, diacritics stripped; phrases stay whole words", () => {
    const stems: CrisisKeywords = { version: 2, languages: { de: { match: "word", stems: ["suizid", "lebensmud", "lebensmued"], phrases: ["mich umbringen"] } } };
    expect(flagsCrisis("Ich habe wieder Suizidgedanken", stems)).toBe(true);
    expect(flagsCrisis("Jugendsuizid", stems)).toBe(true);
    expect(flagsCrisis("Ich bin so lebensmüde", stems)).toBe(true);
    expect(flagsCrisis("ich bin so lebensmuede", stems)).toBe(true);
    expect(flagsCrisis("Heute war ein guter Tag", stems)).toBe(false);
    // A phrase is still whole words, even in a list with stems.
    expect(flagsCrisis("mich umbringen", stems)).toBe(true);
    expect(flagsCrisis("mich umbringender", stems)).toBe(false);
    // A list without stems behaves as before.
    expect(flagsCrisis("Suizidgedanken", LIST)).toBe(false);
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
  it("the matcher the journal uses reads the same contract (a new version needs only the sync)", () => {
    const contract = load();
    expect(CRISIS_KEYWORDS?.version).toBe(contract.version);
    for (const text of contract.fixture.should_flag) expect(flagsCrisis(text, CRISIS_KEYWORDS), text).toBe(true);
    for (const text of contract.fixture.should_not_flag) expect(flagsCrisis(text, CRISIS_KEYWORDS), text).toBe(false);
  });
  it("the app uses it", () => {
    expect(CRISIS_KEYWORDS).not.toBeNull();
  });
});

// Version 4 (app #248, specs/i18n/safety-check-de-it-th.md): the same cases as the app's
// test/crisis_matcher_test.dart "version 4: de, th, it" group, so both clients agree.
describe("version 4: de, th, it", () => {
  const flags = (text: string) => flagsCrisis(text, CRISIS_KEYWORDS);
  const phrases = (lang: string) => CRISIS_KEYWORDS!.languages[lang].phrases;
  const yes = (texts: string[]) => {
    for (const t of texts) expect(flags(t), t).toBe(true);
  };
  const no = (texts: string[]) => {
    for (const t of texts) expect(flags(t), t).toBe(false);
  };

  // Version 5 (app #316, 27 Nov): German only, the de safety report's should-fix phrases
  // ("ein Ende", "lieber tot", "mich toeten" spelled out) with their contract fixtures.
  it("is version 5, with an Italian list", () => {
    expect(CRISIS_KEYWORDS?.version).toBe(5);
    expect(CRISIS_KEYWORDS?.languages.it.match).toBe("word");
  });

  it('de: the separable "umbringen" and "töten", in main clauses', () => {
    yes(["Ich bringe mich um.", "ich bring mich um", "Ehrlich, ich will mich töten.", "ich will mich selbst toten", "ICH BRINGE MICH UM"]);
    // "Das bringt mich um" is the idiom "that's killing me".
    no(["Das bringt mich um, diese Hitze.", "Der Lärm bringt mich noch um.", "Ich bringe meine Mutter um acht zum Bahnhof.", "Wir töten die Zeit mit Karten."]);
  });

  it("th: คิดสั้น and ฆ่าตัวเอง, inside running text (substring)", () => {
    expect(phrases("th")).toEqual(expect.arrayContaining(["คิดสั้น", "ฆ่าตัวเอง"]));
    yes(["ช่วงนี้ฉันคิดสั้นบ่อยมาก", "อยากฆ่าตัวเองให้จบ ๆ ไป"]);
    no(["วันนี้ฉันคิดถึงแม่มาก"]);
  });

  it("it: every phrase flags, alone and in a sentence", () => {
    expect(phrases("it").length).toBeGreaterThan(0);
    for (const p of phrases("it")) {
      expect(flags(p), p).toBe(true);
      expect(flags(`Oggi, ${p}. Basta.`), p).toBe(true);
    }
  });

  it("it: the suicid and autolesion stems take every form", () => {
    yes(["Penso al suicidio.", "ho pensieri suicidi", "un gesto autolesionistico", "Autolesione, di nuovo."]);
  });

  // UX's clear should-fix rows (15 Nov); "ein Ende" left out as too broad. v5 (the de safety
  // report's should-fix, kept by UX's ruling on 27 Nov: the card is gentle and dismissible):
  // de phrase "allem ein ende" flags "Das ist allem ein Ende." now; the bare "ein Ende" stays out.
  // As the app's test/crisis_matcher_test.dart at f27301b8.
  it("the should-fix rows: de, th, it", () => {
    yes(["Ich will tot sein.", "ich will einfach nicht mehr aufwachen", "Ich denke über Freitod nach.", "Freitodgedanken, schon wieder", "บางทีก็ทำร้ายร่างกายตัวเองตอนเครียด", "ฉันไม่อยากอยู่บนโลกนี้อีกแล้ว", "Ogni sera penso di ammazzarmi.", "Das ist allem ein Ende."]);
    no(["Die Batterie ist tot, ich will sie tauschen.", "Der Film hatte ein Ende, das mir gefiel.", "Se non passo l’esame mi ammazzo."]);
  });

  it("it: everyday hyperbole stays quiet", () => {
    no(["Questo lavoro mi sta uccidendo.", "Mia madre mi ammazza se vede la macchina.", "Se non passo l’esame mi ammazzo.", "Muoio dalla voglia di vedere il film.", "Domani vado a tagliarmi i capelli.", "Finalmente l’ho fatta finita con quel progetto."]);
  });
});
