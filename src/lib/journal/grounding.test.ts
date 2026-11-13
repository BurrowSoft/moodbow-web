// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import conditions from "../../../content/conditions.json";
import { findArticle, renderArticle } from "../helpContent";
import { isPendingMet } from "../legalContent";
import { BODY_SCAN_SECONDS, bodyScanAt, GROUNDING, GROUNDING_EXERCISES, isGroundingExercise, nameItMoods } from "./grounding";

// Grounding (1.3; specs/1.3-grounding-and-good-things.md with its Rulings, content/toolbox.json).
const LANGUAGES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const;
type Messages = { app: { tabMe: string }; me: { meGetHelpNow: string }; today: Record<string, string>; toolbox: Record<string, string> };
const messages = (l: string) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as Messages;
const KEYS = ["groundingSenses", "groundingBodyScan", "groundingNameIt", "senses5", "senses4", "senses3", "senses2", "senses1", "groundingNext", "groundingBack", "groundingEnd", "bodyScanIntro", "bodyScan1", "bodyScan2", "bodyScan3", "bodyScan4", "bodyScan5", "bodyScan6", "pause", "resume", "nameItPrompt", "nameItThanks"];

describe("grounding rules (content/toolbox.json)", () => {
  it("are the spec's: senses 5 to 1, a body scan of six 20 s steps (2 min)", () => {
    expect(GROUNDING.senses).toEqual([5, 4, 3, 2, 1]);
    expect(GROUNDING.bodyScanSteps).toBe(6);
    expect(GROUNDING.bodyScanStepSeconds).toBe(20);
    expect(BODY_SCAN_SECONDS).toBe(120);
  });

  it("the body scan's step at each moment, then done", () => {
    expect(bodyScanAt(0)).toEqual({ step: 0, left: 20, done: false });
    expect(bodyScanAt(19.9)).toEqual({ step: 0, left: 1, done: false });
    expect(bodyScanAt(20)).toEqual({ step: 1, left: 20, done: false });
    expect(bodyScanAt(119)).toEqual({ step: 5, left: 1, done: false });
    expect(bodyScanAt(120).done).toBe(true);
    expect(bodyScanAt(500).done).toBe(true);
  });

  it("the three addresses, and nothing else", () => {
    expect(GROUNDING_EXERCISES).toEqual(["5-4-3-2-1", "body-scan", "name-it"]);
    expect(["5-4-3-2-1", "body-scan", "name-it"].every(isGroundingExercise)).toBe(true);
    expect(["", "breathe", "../me", "Name-it"].some(isGroundingExercise)).toBe(false);
  });

  // Ruling 2: only the fixed mood words, never free text; with no check-ins, all of them.
  it("Name it: the moods used, in the scale's order, only 1 to 5; none used, the whole list", () => {
    expect(nameItMoods([{ mood: 4 }, { mood: 2 }, { mood: 4 }])).toEqual([2, 4]);
    expect(nameItMoods([{ mood: 9 }, { mood: "Sad" }, { mood: null }, "x"])).toEqual([1, 2, 3, 4, 5]);
    expect(nameItMoods([])).toEqual([1, 2, 3, 4, 5]);
    expect(nameItMoods(null)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("grounding strings", () => {
  it("en is the spec's copy, word for word, with the Rulings' additions", () => {
    const t = messages("en").toolbox;
    expect([t.senses5, t.senses4, t.senses3, t.senses2, t.senses1]).toEqual([
      "Name 5 things you can see.",
      "Name 4 things you can touch.",
      "Name 3 things you can hear.",
      "Name 2 things you can smell (or skip).",
      "Name 1 thing you can taste (or skip).",
    ]);
    expect(t.groundingEnd).toBe("Well done. Take a moment before you go on.");
    expect(t.bodyScanIntro).toBe("Stop any time, or try 5-4-3-2-1 instead.");
    expect([1, 2, 3, 4, 5, 6].map((n) => t[`bodyScan${n}`])).toEqual(["Notice your feet.", "Your legs.", "Your belly and back.", "Your shoulders.", "Your hands and arms.", "Your face and jaw."]);
    expect(t.nameItPrompt).toBe("What are you feeling right now? Naming it can make it a little smaller.");
    expect(t.nameItThanks).toBe("Thanks for naming it.");
    expect(t.groundingBodyScan).toBe("Body scan (2 min)");
  });

  it("every language has each one, the 5-4-3-2-1 name as is, and its own numbers in each step", () => {
    for (const l of LANGUAGES) {
      const t = messages(l).toolbox;
      for (const k of KEYS) expect(t[k]?.trim(), `${l} ${k}`).toBeTruthy();
      expect(t.groundingSenses, l).toBe("5-4-3-2-1");
      expect(t.bodyScanIntro, l).toContain("5-4-3-2-1");
      for (const n of GROUNDING.senses) expect(t[`senses${n}`], `${l} senses${n}`).toContain(String(n));
      // Steps 4 and 5 (smell, taste) say it can be skipped; the others don't (Ruling 6).
      expect(t.senses2, l).toMatch(/\(.+\)/);
      expect(t.senses1, l).toMatch(/\(.+\)/);
      for (const n of [5, 4, 3]) expect(t[`senses${n}`], `${l} senses${n}`).not.toMatch(/\(/);
    }
  });

  it("fr puts a no-break space before ? : ; ! as everywhere else", () => {
    const t = messages("fr").toolbox;
    for (const k of KEYS) expect(t[k], k).not.toMatch(/ [?:;!]/);
  });
});

// Ruling 8: the Help line shows once the web or the app build people have has grounding.
describe("Help → Things that help me: grounding", () => {
  const render = (l: string, app: boolean, web: boolean) =>
    renderArticle(findArticle(l, "things-that-help")!, (id) => (id === "app_grounding" ? app : id === "grounding_live" ? web : id === "app_toolbox" || id === "toolbox_live" ? true : isPendingMet(id)))
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  for (const l of LANGUAGES) {
    it(`${l}: shown by either side, never by neither; every name in bold is the screen's own`, () => {
      const m = messages(l);
      const t = m.toolbox;
      const names = [t.groundingSenses, t.groundingBodyScan, t.groundingNameIt, t.groundingNext, t.groundingBack, t.pause, t.stop, m.me.meGetHelpNow, `${m.app.tabMe} → ${t.meRow}`];
      for (const [app, web] of [[true, false], [false, true]] as const) {
        const shown = render(l, app, web);
        for (const name of names) expect(shown, `${l} ${app ? "app" : "web"}: ${name}`).toContain(`<strong>${name}</strong>`);
      }
      const neither = render(l, false, false);
      expect(neither).not.toContain(`<strong>${t.groundingBodyScan}</strong>`);
      expect(readFileSync(`content/help/${l}/things-that-help.md`, "utf8")).toContain("{pending:app_grounding|grounding_live}");
    });
  }

  it("not met on either side yet (ships after 1.2)", () => {
    expect(conditions["grounding-live"].met).toBe(false);
    expect(conditions["app-grounding"].met).toBe(false);
  });
});
