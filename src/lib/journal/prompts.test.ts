// @vitest-environment node
import { describe, expect, it } from "vitest";
import contract from "../../../content/contracts/prompts.json";
import { daysSinceEpoch, PROMPTS, promptFor, promptText } from "./prompts";

describe("writing prompts (contracts/prompts.json)", () => {
  it("30 prompts, unique ids, English for each", () => {
    expect(PROMPTS).toHaveLength(30);
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(30);
    for (const p of PROMPTS) expect(p.en.trim()).not.toBe("");
  });

  it.each(contract.fixture)("the contract's fixture: $date → $today, then $another", ({ date, today, another }) => {
    expect(promptFor(date).id).toBe(today);
    expect(promptFor(date, 1).id).toBe(another);
  });

  it("days since 1970-01-01; Another wraps round the list", () => {
    expect(daysSinceEpoch("1970-01-01")).toBe(0);
    expect(daysSinceEpoch("1970-01-31")).toBe(30);
    expect(promptFor("1970-01-30", 1).id).toBe(PROMPTS[0].id);
    expect(promptFor("1970-01-01", 30).id).toBe(PROMPTS[0].id);
  });

  it("the UI language's text, else English", () => {
    const p = PROMPTS[0];
    expect(promptText(p, "en")).toBe(p.en);
    expect(promptText(p, "th")).toBe(p.th);
    expect(promptText({ id: "x", en: "Hello" }, "th")).toBe("Hello");
  });
});
