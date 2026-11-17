import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";

vi.mock("@/lib/stores", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stores")>();
  return { ...real, APP_STORE_URL: real.appStoreUrl("123") };
});
const { APPLE_HEIGHT, BADGE_LOCALES, GOOGLE_ART, GOOGLE_PNG, StoreBadges, appStoreBadge, googlePlayBadge, googleSize } = await import("./StoreBadges");
afterEach(cleanup);

// The official badges (UX & PM, 17 Nov; the Web Tester's #355 row): each brand's art, unmodified,
// in the page's language, every badge the same visible height with its clear space.
const PUBLIC = join(__dirname, "..", "..", "public");
const file = (src: string) => readFileSync(join(PUBLIC, src));
const labels = { play: "Get it on Google Play", appStore: "Download on the App Store" };

// The downloads, byte for byte (Apple's marketing tools; Google Play's badge page). The Google
// crops in GOOGLE_ART were measured from these files' alpha: a changed file fails here first, so
// its crop is measured again.
const SHA256: Record<string, string> = {
  "app-store-de.svg": "4f2967e1f642dd16eec36ac4022f07b7a881cab6301a13be3a4ccfcd3206a614",
  "app-store-en.svg": "a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f",
  "app-store-es.svg": "e4d7c2c1606454536482735c96b933b04ea86a2e72701b3319ae1f3a369b0479",
  "app-store-fr.svg": "86b6a05f6c8ac9e9a0637edf4f15420d06c8c7bc69662792a46793c1f948b023",
  "app-store-it.svg": "ec8e9566058da3382fc0c8b8a8532a342e3587be801fee42e110f8fd707cee0b",
  "app-store-pt-br.svg": "0e9291a9c654e479762b75b51dd94a150af6fab76390a79cb2218cdc8f6cc893",
  "app-store-th.svg": "bd27f5219c96a0810445aeded8de847ad2bc73000d0f5b2f3b116451fff2f2e7",
  "google-play-de.png": "6760aac0db8d24da21f4fd803a06c6ef26c8849e0bd623420973a5666fd3a4c4",
  "google-play-en.png": "f72611e2df8e88204009fd896d05d5e8e83c77009c63943bbffa169559934849",
  "google-play-es.png": "de3f8a494fd6d672e53a700d081e5a2fe37bb480d6848610a1e6c8beb5ba4724",
  "google-play-fr.png": "57d0e69e021d5d08f1fcacfc44e6dd3c79f5d74627bfbc0f696a88f03fb06c4a",
  "google-play-it.png": "d2b0cbfe2924e82a023c7760a872c5a388c7335c76df907f3ea35cd5423ff94d",
  "google-play-pt-br.png": "e1ad5e03f636d94b05448c1f156e39b012b9e1d772b730d9e27d066695531a6b",
  "google-play-th.png": "343da9651d3c9fbfc7fb3a0ff82de9d0c1dd6535b31879cfabd1d35cd182dafd",
};

describe("StoreBadges", () => {
  it("both badges in the page's language, each linking to its store, named with the badge's own words", () => {
    render(<StoreBadges stores={{ play: true, appStore: true }} locale="th" labels={labels} testId="home" />);
    const apple = screen.getByTestId("home-store-appstore");
    expect(apple).toHaveAttribute("href", "https://apps.apple.com/app/id123");
    expect(apple.querySelector("img")).toHaveAttribute("src", "/badges/app-store-th.svg");
    expect(apple.querySelector("img")).toHaveAttribute("alt", labels.appStore);
    const play = screen.getByTestId("home-store-play");
    expect(play.getAttribute("href")).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.burrowsoft\.moodbow/);
    expect(play.querySelector("img")).toHaveAttribute("src", "/badges/google-play-th.png");
    expect(play.querySelector("img")).toHaveAttribute("alt", labels.play);
    // Counted as taps by name only (specs/analytics.md).
    expect(apple).toHaveAttribute("data-count", "cta_store_appstore");
    expect(play).toHaveAttribute("data-count", "cta_store_play");
  });

  it("only the live stores", () => {
    render(<StoreBadges stores={{ play: false, appStore: true }} locale="en" labels={labels} testId="home" />);
    expect(screen.queryByTestId("home-store-play")).toBeNull();
    expect(screen.getByTestId("home-store-appstore")).toBeInTheDocument();
  });

  it("Apple at 40 px with a quarter of that as clear space", () => {
    render(<StoreBadges stores={{ play: true, appStore: true }} locale="en" labels={labels} testId="home" />);
    const apple = screen.getByTestId("home-store-appstore");
    expect(APPLE_HEIGHT).toBe(40);
    expect(apple.querySelector("img")).toHaveAttribute("height", "40");
    expect(apple.className).toContain("p-[10px]");
  });

  it.each([...BADGE_LOCALES])("%s: Google's visible badge is Apple's 40 px (never taller), with 10 px clear space on every side", (locale) => {
    const art = GOOGLE_ART[locale];
    const size = googleSize(locale);
    const scale = size.height / GOOGLE_PNG.height;
    const visible = (art.bottom - art.top + 1) * scale;
    expect(visible).toBeGreaterThan(39.5);
    expect(visible).toBeLessThanOrEqual(40.5);
    // Clear space = the PNG's own transparent margin, scaled, plus the link's padding.
    const space = {
      top: art.top * scale + size.padY,
      bottom: (GOOGLE_PNG.height - 1 - art.bottom) * scale + size.padY,
      left: art.left * scale + size.padX,
      right: (GOOGLE_PNG.width - 1 - art.right) * scale + size.padX,
    };
    for (const [side, px] of Object.entries(space)) expect(px, side).toBeGreaterThanOrEqual(9.5);
    render(<StoreBadges stores={{ play: true, appStore: false }} locale={locale} labels={labels} testId="home" />);
    const play = screen.getByTestId("home-store-play");
    expect(play.querySelector("img")).toHaveAttribute("height", String(size.height));
    if (size.padX) expect(play.className).toContain(`px-[${size.padX}px]`);
    if (size.padY) expect(play.className).toContain(`py-[${size.padY}px]`);
  });

  it("art for every language the site has, the brands' own files byte for byte", () => {
    expect([...BADGE_LOCALES].sort()).toEqual([...ALL_LOCALES].sort());
    for (const locale of BADGE_LOCALES) {
      for (const src of [appStoreBadge(locale), googlePlayBadge(locale)]) {
        const name = src.split("/").pop()!;
        expect(createHash("sha256").update(file(src)).digest("hex"), name).toBe(SHA256[name]);
      }
      const png = file(googlePlayBadge(locale));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], locale).toEqual([GOOGLE_PNG.width, GOOGLE_PNG.height]);
    }
  });
});

// WCAG 2.5.3 (the Web Tester + UX): each link's name holds the words printed on its badge.
describe("badge names in each language (home.storeBadge*)", () => {
  const printed: Record<string, [apple: string, play: string]> = {
    en: ["Download on the App Store", "Get it on Google Play"],
    fr: ["Télécharger dans l'App Store", "Disponible sur Google Play"],
    es: ["Consíguelo en el App Store", "Disponible en Google Play"],
    "pt-br": ["Baixar na App Store", "Disponível no Google Play"],
    de: ["Laden im App Store", "Jetzt bei Google Play"],
    it: ["Scarica su App Store", "Disponibile su Google Play"],
    th: ["ดาวน์โหลดได้ที่ App Store", "ดาวน์โหลดที่ Google Play"],
  };
  it.each(Object.entries(printed))("%s", async (locale, [apple, play]) => {
    const messages = (await import(`@/messages/${locale}.json`)).default as { home: Record<string, string> };
    expect(messages.home.storeBadgeAppStore).toBe(apple);
    expect(messages.home.storeBadgePlay).toBe(play);
  });
});
