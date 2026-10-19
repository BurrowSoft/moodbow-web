// @vitest-environment node
import { describe, expect, it } from "vitest";
import registry from "../../../content/contracts/countries.json";
import { countryOptions, isCountry, isTimeZoneName, ISO_COUNTRIES, timeZoneOptions } from "./countries";

describe("Me → Language & region lists", () => {
  it("all 249 ISO 3166-1 countries, unique, including every helpline-registry country", () => {
    expect(ISO_COUNTRIES).toHaveLength(249);
    expect(new Set(ISO_COUNTRIES).size).toBe(249);
    for (const c of registry.countries) expect(ISO_COUNTRIES, c.code).toContain(c.code);
    expect(isCountry("TH")).toBe(true);
    expect(isCountry("XX")).toBe(false);
    expect(isCountry("th")).toBe(false);
  });

  it("country names in the UI language, sorted by name", () => {
    const options = countryOptions("en");
    expect(options).toHaveLength(249);
    expect(options.find(([c]) => c === "TH")?.[1]).toBe("Thailand");
    const names = options.map(([, n]) => n);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("time zones include UTC and the profile's own, even an unlisted one", () => {
    expect(timeZoneOptions(null)).toContain("UTC");
    expect(timeZoneOptions("Asia/Bangkok")).toContain("Asia/Bangkok");
    expect(timeZoneOptions("Etc/Unlisted")[0]).toBe("Etc/Unlisted");
    expect(isTimeZoneName("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimeZoneName("Etc/GMT+5")).toBe(true);
    expect(isTimeZoneName("../etc/passwd")).toBe(false);
    expect(isTimeZoneName("")).toBe(false);
  });
});
