import { describe, expect, it } from "vitest";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { activitiesToTags, addTag, normalizeTag, parseTags, TAG_RULES, tagsCsvCell, tagsFlagCrisis } from "./tags";

describe("a tag: the person's own words, stored tidy", () => {
  it("trimmed, inner spaces as one, case as typed", () => {
    expect(normalizeTag("  Long   walk \n")).toBe("Long walk");
  });
  it("adding: up to 5 a day, each up to 32 characters, no case-insensitive repeat", () => {
    let tags: string[] = [];
    for (const t of ["Walk", "Friends", "Rain", "Work", "Tea"]) tags = addTag(tags, t).tags;
    expect(tags).toEqual(["Walk", "Friends", "Rain", "Work", "Tea"]);
    expect(addTag(tags, "Cooking")).toEqual({ tags, problem: "too_many" });
    expect(addTag(["Walk"], "walk")).toEqual({ tags: ["Walk"], problem: "duplicate" });
    expect(addTag([], "   ")).toEqual({ tags: [], problem: "empty" });
    expect(addTag([], "x".repeat(TAG_RULES.maxChars)).problem).toBeNull();
    expect(addTag([], "x".repeat(TAG_RULES.maxChars + 1)).problem).toBe("too_long");
    // Characters, not bytes: 32 Thai characters fit.
    expect(addTag([], "ก".repeat(32)).problem).toBeNull();
  });
});

describe("parseTags: the form's field, checked again on the server", () => {
  it("a clean list; empty or none is no tags", () => {
    expect(parseTags('["Walk"," walk ","Rain"]')).toEqual(["Walk", "Rain"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags(null)).toEqual([]);
  });
  it("anything that breaks a rule refuses the save", () => {
    expect(parseTags("not json")).toBeNull();
    expect(parseTags('[1,2]')).toBeNull();
    expect(parseTags(JSON.stringify(["a", "b", "c", "d", "e", "f"]))).toBeNull();
    expect(parseTags(JSON.stringify(["x".repeat(33)]))).toBeNull();
  });
});

describe("export and import", () => {
  it("the CSV cell: joined by \" | \", a \"|\" inside a tag as \"/\"", () => {
    expect(tagsCsvCell(["Walk", "Rain"])).toBe("Walk | Rain");
    expect(tagsCsvCell(["A|B"])).toBe("A/B");
    expect(tagsCsvCell([])).toBe("");
  });
  it("Daylio's activities become tags: split on |, trimmed, cut to 32, the first 5 different", () => {
    expect(activitiesToTags("friends | walk | good meal")).toEqual(["friends", "walk", "good meal"]);
    expect(activitiesToTags("a|b|c|d|e|f|g")).toEqual(["a", "b", "c", "d", "e"]);
    expect(activitiesToTags("Walk | walk | ")).toEqual(["Walk"]);
    expect(activitiesToTags("y".repeat(40))).toEqual(["y".repeat(32)]);
    expect(activitiesToTags("")).toEqual([]);
  });
});

describe("tagsFlagCrisis: the crisis list reads tags, as it reads writing (UX)", () => {
  const phrase = CRISIS_KEYWORDS!.languages.en.phrases[0];
  it("one matching tag offers help", () => {
    expect(tagsFlagCrisis(["Rain", phrase], CRISIS_KEYWORDS)).toBe(true);
  });
  it("a phrase split across tags still counts", () => {
    const [first, ...rest] = phrase.split(" ");
    expect(tagsFlagCrisis([first, rest.join(" ")], CRISIS_KEYWORDS)).toBe(true);
  });
  it("a near miss and ordinary tags don't", () => {
    expect(tagsFlagCrisis(["killer workout", "myself time"], CRISIS_KEYWORDS)).toBe(false);
    expect(tagsFlagCrisis(["Walk", "Friends"], CRISIS_KEYWORDS)).toBe(false);
    expect(tagsFlagCrisis([], CRISIS_KEYWORDS)).toBe(false);
  });
});
