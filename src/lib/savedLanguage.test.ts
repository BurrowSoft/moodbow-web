// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { goToLanguage, languageUrl, savedLanguageRoute } from "./savedLanguage";

const OFFERED = ["en", "fr", "es", "pt-br"];

describe("savedLanguageRoute", () => {
  it("the saved language wins when it differs and is offered", () => {
    expect(savedLanguageRoute("fr", "en", OFFERED)).toBe("fr");
    expect(savedLanguageRoute("en", "fr", OFFERED)).toBe("en");
  });
  it("pt is stored for the /pt-br route: no move on /pt-br, and a move to it elsewhere", () => {
    expect(savedLanguageRoute("pt", "pt-br", OFFERED)).toBeNull();
    expect(savedLanguageRoute("pt", "en", OFFERED)).toBe("pt-br");
  });
  it("already there, or nothing saved: stays", () => {
    expect(savedLanguageRoute("fr", "fr", OFFERED)).toBeNull();
    expect(savedLanguageRoute(null, "fr", OFFERED)).toBeNull();
    expect(savedLanguageRoute(undefined, "en", OFFERED)).toBeNull();
    expect(savedLanguageRoute("", "en", OFFERED)).toBeNull();
  });
  it("a saved language that isn't offered keeps the route", () => {
    expect(savedLanguageRoute("de", "en", OFFERED)).toBeNull();
    expect(savedLanguageRoute("th", "fr", OFFERED)).toBeNull();
  });
  it("a draft route on a test build stays, so it can be read", () => {
    expect(savedLanguageRoute("en", "th", OFFERED)).toBeNull();
    expect(savedLanguageRoute("fr", "de", OFFERED)).toBeNull();
  });
});

describe("goToLanguage", () => {
  afterEach(() => {
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
    vi.restoreAllMocks();
  });
  it("English is unprefixed, the others aren't", () => {
    expect(languageUrl("en", "/app/me")).toBe("/app/me");
    expect(languageUrl("pt-br", "/app")).toBe("/pt-br/app");
  });
  it("sets the cookie before it leaves, so the proxy can't send it back", () => {
    const go = vi.fn(() => expect(document.cookie).toContain("NEXT_LOCALE=en"));
    goToLanguage("en", "/app/timeline?month=2026-10", go);
    expect(go).toHaveBeenCalledWith("/app/timeline?month=2026-10");
  });
});
