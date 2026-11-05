// @vitest-environment node
import { describe, expect, it } from "vitest";
import { conditionMet } from "@/lib/conditions";
import { isHiddenPage, pagePath } from "@/lib/sitemapPages";
import { ALL_LOCALES, dataLocale, OFFER_GATE, offeredLocales, routeLocale, routing, servedLocales } from "./routing";

// Each language behind its own offered condition: served as a draft on
// test builds, offered (switcher, Me → Language, hreflang, sitemap) only
// once met; Production is English only until then.
const unmet = () => false;
const met = () => true;
const ALL = ["en", "th", "fr", "es", "pt-br", "de", "it"];
// A draft is a language not offered yet in content/conditions.json.
const WITH_DRAFTS = ALL.filter((l) => l === "en" || !conditionMet(OFFER_GATE[l as keyof typeof OFFER_GATE]));
const BUILDS = [{ vercelEnv: "production" }, { vercelEnv: "preview" }, { nodeEnv: "development" }, { nodeEnv: "production", showDrafts: "1" }, {}];

describe("servedLocales: which languages a build serves", () => {
  it("unmet: Production (and an unknown build) English only; test builds also /th as a draft", () => {
    expect(servedLocales({ vercelEnv: "production" }, unmet)).toEqual(["en"]);
    expect(servedLocales({ vercelEnv: "production", showDrafts: "1", nodeEnv: "development" }, unmet)).toEqual(["en"]);
    expect(servedLocales({}, unmet)).toEqual(["en"]);
    expect(servedLocales({ vercelEnv: "preview" }, unmet)).toEqual(WITH_DRAFTS);
    expect(servedLocales({ nodeEnv: "development" }, unmet)).toEqual(WITH_DRAFTS);
    expect(servedLocales({ nodeEnv: "production", showDrafts: "1" }, unmet)).toEqual(WITH_DRAFTS);
  });

  it("met: every build serves Thai", () => {
    for (const build of BUILDS) expect(servedLocales(build, met)).toEqual(ALL);
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
    expect(offeredLocales(met)).toEqual(ALL);
  });

  it("in content/conditions.json: French, Spanish and Portuguese; German, Italian and Thai wait for their native review", () => {
    expect(offeredLocales()).toEqual(["en", "fr", "es", "pt-br"]);
  });
});

// Whether the legal pages are live (as #100 derives it): the pins below hold either way.
const LEGAL = conditionMet("privacy-text-approved") && conditionMet("terms-text-approved");

describe("the legal pages keep their own gate in every language (UX, decision 164)", () => {
  it("/th/privacy and /th/terms are hidden exactly when /privacy and /terms are, on every build", () => {
    for (const build of BUILDS) {
      for (const page of ["/privacy", "/terms", "/account-deletion"]) {
        expect(isHiddenPage(pagePath(`/th${page}`, ALL_LOCALES), build), `${page} ${JSON.stringify(build)}`).toBe(isHiddenPage(page, build));
      }
    }
    // Production: both 404 until the legal pages are met (decision 164), then both served.
    expect(isHiddenPage(pagePath("/th/privacy", ALL_LOCALES), { vercelEnv: "production" })).toBe(!LEGAL);
  });
});

describe("one gate per language", () => {
  const only = (gate: string) => (id: string) => id === gate;
  it("offering one language offers only that one", () => {
    expect(offeredLocales(only("fr-offered-live"))).toEqual(["en", "fr"]);
    expect(offeredLocales(only("pt-br-offered-live"))).toEqual(["en", "pt-br"]);
  });
  it("Production serves a language only once it's offered", () => {
    expect(servedLocales({ vercelEnv: "production" }, only("es-offered-live"))).toEqual(["en", "es"]);
  });
});

// /pt-br is "pt" in the profile, user_metadata, send-email and the contracts.
describe("dataLocale / routeLocale", () => {
  it("/pt-br is stored as pt, and pt comes back as /pt-br; the rest are their own code", () => {
    expect(dataLocale("pt-br")).toBe("pt");
    expect(routeLocale("pt")).toBe("pt-br");
    for (const l of ["en", "th", "fr", "es", "de", "it"]) {
      expect(dataLocale(l)).toBe(l);
      expect(routeLocale(l)).toBe(l);
    }
  });
});
