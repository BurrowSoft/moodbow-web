import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BO_ERROR_TEXT, BO_ERRORS, BO_REASONS, boButtonShows, boCanTurnOn, boReasonProblem, boSpeaks, parseBoSend, parseBoStatus, type BoStatus } from "./bo";
import conditions from "../../../content/conditions.json";
import messages from "@/messages/en.json";

describe("Bo's consent text", () => {
  // Vitor's text replaces this. The flag can't go on with the placeholder in.
  it("bo-live stays off while the consent is a placeholder", () => {
    if (messages.bo.consentBody.startsWith("[Placeholder") || messages.bo.journalSwitchNote.startsWith("[Placeholder")) expect(conditions["bo-live"].met).toBe(false);
  });
});

describe("the bo contract (content/contracts/bo.md, pinned)", () => {
  const codes = [...readFileSync("content/contracts/bo.md", "utf8").matchAll(/^\| `([a-z_]+)` \| \d{3} \|/gm)].map((m) => m[1]).sort();
  it("every error code it lists is one this client knows, and the reverse", () => {
    expect(codes.length).toBeGreaterThan(10);
    expect([...BO_ERRORS].sort()).toEqual(codes);
  });
  it("every one has its line", () => {
    for (const code of codes) expect(BO_ERROR_TEXT[code as keyof typeof BO_ERROR_TEXT], code).toBeTruthy();
  });
});

describe("Bo's languages (decision 239)", () => {
  it("speaks en, es, fr and pt-BR, and nothing else until it's evaluated", () => {
    for (const route of ["en", "es", "fr", "pt-br"]) expect(boSpeaks(route), route).toBe(true);
    for (const route of ["de", "it", "th", "pt", "xx"]) expect(boSpeaks(route), route).toBe(route === "pt");
  });
});

describe("what each of the status's reasons shows (bo.md, Client column; decision 240)", () => {
  const no = (reason: (typeof BO_REASONS)[number]): BoStatus => ({ status: "ok", available: false, reason, pictures: false, maxChars: 2000 });
  it("the button: available, the budget's spent (its line), or consent (it opens consent); never otherwise", () => {
    expect(boButtonShows({ status: "ok", available: true, reason: null, pictures: false, maxChars: 2000 })).toBe(true);
    for (const reason of BO_REASONS) expect(boButtonShows(no(reason)), reason).toBe(reason === "budget" || reason === "consent");
    expect(boButtonShows({ status: "no_answer" })).toBe(false);
  });
  it("Me offers Bo back only where the person's own switch, consent or the budget is all that's in the way", () => {
    for (const reason of BO_REASONS) expect(boCanTurnOn(no(reason)), reason).toBe(reason === "budget" || reason === "bo_off" || reason === "consent");
  });
  it("on Bo's screen a reason is its send error, which closes the box with help", () => {
    expect(boReasonProblem(null)).toBe(null);
    expect(boReasonProblem("consent")).toBe(null);
    expect(boReasonProblem("off")).toBe("bo_not_available");
    expect(boReasonProblem("budget")).toBe("bo_not_available");
    expect(boReasonProblem("age")).toBe("age_off");
    for (const reason of ["region_off", "region_unknown", "language_off", "bo_off"] as const) expect(boReasonProblem(reason)).toBe(reason);
    for (const reason of BO_REASONS) {
      const problem = boReasonProblem(reason);
      if (problem) expect(BO_ERRORS, reason).toContain(problem);
    }
  });
});

// Me's journal-switch line showed "[Placeholder," on a Preview (Web Tester, #205): expected there,
// with the flag forced on, never live. Every language is held to it, not only English.
describe("Bo's placeholders, in every language", () => {
  const met = (id: string) => (conditions as Record<string, { met?: boolean } | undefined>)[id]?.met === true;
  it.each(["en", "fr", "es", "pt-br", "de", "it", "th"])("%s: none left while its flag could be on", (l) => {
    const bo = (JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as { bo: Record<string, string> }).bo;
    const held = Object.entries(bo).filter(([, v]) => v.includes("[Placeholder")).map(([k]) => k);
    if (met("bo-live")) expect(held.filter((k) => !k.startsWith("picture"))).toEqual([]);
    if (met("bo-pictures-live")) expect(held.filter((k) => k.startsWith("picture"))).toEqual([]);
  });
});

// help_country: only ever two capital letters the server verified, else nothing (bo.md).
describe("help_country on status and send", () => {
  it("two capital letters: kept; anything else: absent", () => {
    expect(parseBoStatus({ available: true, help_country: "TH" })).toMatchObject({ helpCountry: "TH" });
    expect(parseBoSend({ reply: "Hi", help_country: "NZ" })).toMatchObject({ helpCountry: "NZ" });
    for (const bad of ["th", "THA", "T1", "", 5, null, undefined]) {
      expect(parseBoStatus({ available: false, reason: "region_off", help_country: bad })).not.toHaveProperty("helpCountry");
      expect(parseBoSend({ reply: "Hi", help_country: bad })).not.toHaveProperty("helpCountry");
    }
  });
});
