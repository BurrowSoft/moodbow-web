// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isHiddenPage, pagePath } from "@/lib/sitemapPages";
import { ALL_LOCALES, offeredLocales, routing, servedLocales } from "./routing";

// Thai on the web (1.1 F) behind thai-offered-live: served as a draft on
// test builds, offered (switcher, Me → Language, hreflang, sitemap) only
// once met; Production is English only until then.
const unmet = () => false;
const met = () => true;
const BUILDS = [{ vercelEnv: "production" }, { vercelEnv: "preview" }, { nodeEnv: "development" }, { nodeEnv: "production", showDrafts: "1" }, {}];

describe("servedLocales: which languages a build serves", () => {
  it("unmet: Production (and an unknown build) English only; test builds also /th as a draft", () => {
    expect(servedLocales({ vercelEnv: "production" }, unmet)).toEqual(["en"]);
    expect(servedLocales({ vercelEnv: "production", showDrafts: "1", nodeEnv: "development" }, unmet)).toEqual(["en"]);
    expect(servedLocales({}, unmet)).toEqual(["en"]);
    expect(servedLocales({ vercelEnv: "preview" }, unmet)).toEqual(["en", "th"]);
    expect(servedLocales({ nodeEnv: "development" }, unmet)).toEqual(["en", "th"]);
    expect(servedLocales({ nodeEnv: "production", showDrafts: "1" }, unmet)).toEqual(["en", "th"]);
  });

  it("met: every build serves Thai", () => {
    for (const build of BUILDS) expect(servedLocales(build, met)).toEqual(["en", "th"]);
  });

  it("English first and the default, unprefixed", () => {
    expect(ALL_LOCALES[0]).toBe("en");
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("as-needed");
  });
});

describe("offeredLocales: what the switcher, Me, hreflang and the sitemap offer", () => {
  it("only once met, never for a draft", () => {
    expect(offeredLocales(unmet)).toEqual(["en"]);
    expect(offeredLocales(met)).toEqual(["en", "th"]);
  });

  it("not met in content/conditions.json yet: English only", () => {
    expect(offeredLocales()).toEqual(["en"]);
  });
});

describe("the legal pages keep their own gate in every language (UX, decision 164)", () => {
  it("/th/privacy and /th/terms are hidden exactly when /privacy and /terms are, on every build", () => {
    for (const build of BUILDS) {
      for (const page of ["/privacy", "/terms", "/account-deletion"]) {
        expect(isHiddenPage(pagePath(`/th${page}`, ALL_LOCALES), build), `${page} ${JSON.stringify(build)}`).toBe(isHiddenPage(page, build));
      }
    }
    // Production, unmet: both 404.
    expect(isHiddenPage(pagePath("/th/privacy", ALL_LOCALES), { vercelEnv: "production" })).toBe(true);
  });
});
