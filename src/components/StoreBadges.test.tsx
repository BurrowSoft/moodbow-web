import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_LOCALES } from "@/i18n/routing";

vi.mock("@/lib/stores", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stores")>();
  return { ...real, APP_STORE_URL: real.appStoreUrl("123") };
});
const { APPLE_HEIGHT, BADGE_LOCALES, GOOGLE_HEIGHT, StoreBadges, appStoreBadge, googlePlayBadge } = await import("./StoreBadges");
afterEach(cleanup);

// The official badges (UX & PM, 17 Nov): each brand's art, unmodified, in the
// page's language, at the sizes their rules ask for.
const PUBLIC = join(__dirname, "..", "..", "public");
const file = (src: string) => readFileSync(join(PUBLIC, src));
const labels = { play: "Google Play", appStore: "App Store" };

describe("StoreBadges", () => {
  it("both badges in the page's language, each linking to its store, named for screen readers", () => {
    render(<StoreBadges stores={{ play: true, appStore: true }} locale="th" labels={labels} testId="home" />);
    const apple = screen.getByTestId("home-store-appstore");
    expect(apple).toHaveAttribute("href", "https://apps.apple.com/app/id123");
    expect(apple.querySelector("img")).toHaveAttribute("src", "/badges/app-store-th.svg");
    expect(apple.querySelector("img")).toHaveAttribute("alt", "App Store");
    const play = screen.getByTestId("home-store-play");
    expect(play.getAttribute("href")).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.burrowsoft\.moodbow/);
    expect(play.querySelector("img")).toHaveAttribute("src", "/badges/google-play-th.png");
    expect(play.querySelector("img")).toHaveAttribute("alt", "Google Play");
  });

  it("only the live stores", () => {
    render(<StoreBadges stores={{ play: false, appStore: true }} locale="en" labels={labels} testId="home" />);
    expect(screen.queryByTestId("home-store-play")).toBeNull();
    expect(screen.getByTestId("home-store-appstore")).toBeInTheDocument();
  });

  it("the sizes the brands ask for: Apple at least 40 px tall with a quarter of that as clear space; Google's PNG (its own clear space) at 60 px", () => {
    render(<StoreBadges stores={{ play: true, appStore: true }} locale="en" labels={labels} testId="home" />);
    const apple = screen.getByTestId("home-store-appstore");
    expect(APPLE_HEIGHT).toBeGreaterThanOrEqual(40);
    expect(apple.querySelector("img")).toHaveAttribute("height", String(APPLE_HEIGHT));
    expect(apple.className).toContain(`p-[${APPLE_HEIGHT / 4}px]`);
    expect(screen.getByTestId("home-store-play").querySelector("img")).toHaveAttribute("height", String(GOOGLE_HEIGHT));
  });

  it("art for every language the site has, from the brands themselves (never redrawn)", () => {
    expect([...BADGE_LOCALES].sort()).toEqual([...ALL_LOCALES].sort());
    for (const locale of BADGE_LOCALES) {
      const svg = file(appStoreBadge(locale)).toString("utf8");
      expect(svg, locale).toMatch(/<title>Download_on_the_App_Store_Badge_/);
      expect(svg, locale).not.toMatch(/<script|on[a-z]+=|href=/i);
      const png = file(googlePlayBadge(locale));
      expect(png.subarray(1, 4).toString("ascii"), locale).toBe("PNG");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], locale).toEqual([646, 250]);
    }
  });
});
