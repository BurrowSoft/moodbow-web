import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

let path = "/";
let appStoreUrl: string | null = "https://apps.apple.com/app/id1";
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => path,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/stores", async (orig) => ({
  ...(await orig<typeof import("@/lib/stores")>()),
  get APP_STORE_URL() {
    return appStoreUrl;
  },
}));
const { TryAppButton } = await import("./TryAppButton");

const OFF = { play: false, appStore: false };
const ON = { play: true, appStore: true };
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile";

const setup = (ua: string, stores = OFF, journal = true) => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TryAppButton journal={journal} stores={stores} />
    </NextIntlClientProvider>,
  );
  return screen.queryByTestId("try-app");
};

beforeEach(() => {
  path = "/";
  appStoreUrl = "https://apps.apple.com/app/id1";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TryAppButton", () => {
  it("before any store is public: the web journal's start, on any phone; only below the phone breakpoint", () => {
    for (const ua of [ANDROID, IPHONE]) {
      const button = setup(ua);
      expect(button).toHaveAttribute("href", "/welcome");
      expect(button).toHaveTextContent(messages.common.tryApp);
      expect(button).toHaveClass("sm:hidden");
      cleanup();
    }
  });

  it("each phone goes to its own store once that store is public", () => {
    expect(setup(ANDROID, ON)?.getAttribute("href")).toContain("play.google.com");
    cleanup();
    expect(setup(IPHONE, ON)).toHaveAttribute("href", "https://apps.apple.com/app/id1");
  });

  it("only one store public: the other phone keeps the journal's start", () => {
    expect(setup(IPHONE, { play: true, appStore: false })).toHaveAttribute("href", "/welcome");
    cleanup();
    expect(setup(ANDROID, { play: false, appStore: true })).toHaveAttribute("href", "/welcome");
  });

  it("never the Android-only intent link", () => {
    expect(setup(ANDROID, ON)?.getAttribute("href")).not.toMatch(/^intent:/);
  });

  it.each(["/app", "/app/me", "/app/entries/x", "/setup", "/welcome"])("%s: not shown", (p) => {
    path = p;
    expect(setup(ANDROID, ON)).toBeNull();
  });

  it.each(["/", "/help", "/privacy", "/terms", "/sign-in", "/sign-up", "/appstore"])("%s: shown", (p) => {
    path = p;
    expect(setup(ANDROID)).not.toBeNull();
  });

  it("the journal off and no store for this phone: nothing, so it can't lead to a 404", () => {
    expect(setup(IPHONE, { play: true, appStore: false }, false)).toBeNull();
    cleanup();
    expect(setup(ANDROID, ON, false)?.getAttribute("href")).toContain("play.google.com");
  });
});
