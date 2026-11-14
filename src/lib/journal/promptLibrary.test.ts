// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import free from "../../../content/contracts/prompts.json";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { groupOpen, LIBRARY, LIBRARY_PLACE_KEY, libraryPrompt, libraryText, readPlace, savePlace } from "./promptLibrary";

const LANGUAGES = ["en", "fr", "es", "pt", "de", "it", "th"] as const;

// UX's rulings (12 Nov; specs/plus-prompts-draft.md), from the shared contract.
describe("the prompt library's contract", () => {
  it("five groups in list order, six prompts each, ids lib-<group>-<n>", () => {
    expect(LIBRARY.map((g) => g.id)).toEqual(["noticing", "gratitude", "hard-days", "relationships", "ahead"]);
    for (const g of LIBRARY) {
      expect(g.prompts, g.id).toHaveLength(6);
      expect(g.prompts.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `lib-${g.id}-${n}`));
    }
  });
  it("Hard days is free and shows Get help now; the other four are Plus", () => {
    for (const g of LIBRARY) {
      expect(g.plus, g.id).toBe(g.id !== "hard-days");
      expect(g.help, g.id).toBe(g.id === "hard-days");
    }
  });
  it("every prompt in all seven languages, none repeating a free prompt", () => {
    const freeTexts = new Set(free.prompts.flatMap((p) => Object.entries(p).filter(([k]) => k !== "id").map(([, v]) => String(v).toLowerCase())));
    for (const p of LIBRARY.flatMap((g) => g.prompts)) {
      for (const language of LANGUAGES) {
        const text = p[language];
        expect(typeof text === "string" && text.trim() !== "", `${p.id} ${language}`).toBe(true);
        expect(freeTexts.has(String(text).toLowerCase()), `${p.id} ${language} repeats a free prompt`).toBe(false);
      }
    }
  });
  it("no prompt, in any language, sets off the crisis matcher (rule 10)", () => {
    for (const p of LIBRARY.flatMap((g) => g.prompts)) for (const language of LANGUAGES) expect(flagsCrisis(String(p[language]), CRISIS_KEYWORDS), `${p.id} ${language}`).toBe(false);
  });
  it("the UI language's text, /pt-br reading pt, else English", () => {
    const p = LIBRARY[0].prompts[0];
    expect(libraryText(p, "pt-br")).toBe(p.pt);
    expect(libraryText(p, "fr")).toBe(p.fr);
    expect(libraryText(p, "en")).toBe(p.en);
  });
});

describe("open groups and the place", () => {
  beforeEach(() => window.localStorage.clear());

  it("a free group always, a Plus group only with Plus", () => {
    const hard = LIBRARY.find((g) => g.id === "hard-days")!;
    const noticing = LIBRARY.find((g) => g.id === "noticing")!;
    expect(groupOpen(hard, false)).toBe(true);
    expect(groupOpen(noticing, false)).toBe(false);
    expect(groupOpen(noticing, true)).toBe(true);
  });
  it("list order, wrapping round", () => {
    const g = LIBRARY[0];
    expect(libraryPrompt(g, 0).id).toBe("lib-noticing-1");
    expect(libraryPrompt(g, 6).id).toBe("lib-noticing-1");
    expect(libraryPrompt(g, 7).id).toBe("lib-noticing-2");
  });
  it("each group resumes where it was left, per person on this device; anything odd is the top", () => {
    expect(readPlace("u1", "gratitude")).toBe(0);
    savePlace("u1", "gratitude", 3);
    savePlace("u1", "ahead", 1);
    savePlace("u2", "gratitude", 5);
    expect(readPlace("u1", "gratitude")).toBe(3);
    expect(readPlace("u1", "ahead")).toBe(1);
    expect(readPlace("u2", "gratitude")).toBe(5);
    expect(readPlace("u1", "noticing")).toBe(0);
    window.localStorage.setItem(LIBRARY_PLACE_KEY, "not json");
    expect(readPlace("u1", "gratitude")).toBe(0);
    window.localStorage.setItem(LIBRARY_PLACE_KEY, JSON.stringify({ u1: { gratitude: -2, ahead: 1.5 } }));
    expect(readPlace("u1", "gratitude")).toBe(0);
    expect(readPlace("u1", "ahead")).toBe(0);
  });
});
