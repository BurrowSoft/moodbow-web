import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BO_ERROR_TEXT, BO_ERRORS, boSpeaks } from "./bo";
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
