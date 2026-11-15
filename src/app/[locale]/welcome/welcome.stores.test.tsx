import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Welcome's store line (decision 185, UX 13 Nov): Home's words and links once a store is public,
// nothing before (no "coming soon" on the way into the journal). The Play link is the shared one,
// with decision 79's campaign referrer added in the browser.
let met: string[] = [];
vi.mock("@/lib/conditions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conditions")>()),
  conditionMet: (id: string) => met.includes(id),
  pageGate: () => "shown",
}));
vi.mock("@/lib/stores", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stores")>();
  return {
    ...real,
    APP_STORE_ID: "123",
    APP_STORE_URL: real.appStoreUrl("123"),
    liveStores: () => real.liveStores((id) => met.includes(id), "123"),
  };
});
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (ns: keyof typeof messages) => (key: string) => (messages[ns] as Record<string, string>)[key],
  getMessages: async () => messages,
}));
// The help card itself is SafetyCard's (its own tests); here, only that welcome places it.
vi.mock("@/components/SafetyCard", () => ({
  GetHelpNow: ({ testId, icon, neutral, country }: { testId: string; icon?: boolean; neutral?: boolean; country: string | null }) => (
    <span data-testid={testId} data-icon={String(icon)} data-neutral={String(neutral)} data-country={String(country)} />
  ),
}));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("./WelcomeSlides", () => ({ WelcomeSlides: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => null, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { default: WelcomePage } = await import("./page");
afterEach(cleanup);

const h = messages.home;
const renderWelcome = async () => render(await WelcomePage({ params: Promise.resolve({ locale: "en" }) } as PageProps<"/[locale]/welcome">));

describe("Welcome's store line", () => {
  it("no store public: nothing at all, not even coming soon", async () => {
    met = [];
    await renderWelcome();
    expect(screen.queryByTestId("welcome-stores")).toBeNull();
  });

  it("Google Play public: Get the app: Google Play, to the listing, with no App Store", async () => {
    met = ["play-live"];
    await renderWelcome();
    expect(screen.getByTestId("welcome-stores")).toHaveTextContent(`${h.storeGetApp} ${h.storeGooglePlay}`);
    expect(screen.getByTestId("welcome-store-play")).toHaveAttribute("href", "https://play.google.com/store/apps/details?id=com.burrowsoft.moodbow");
    expect(screen.queryByTestId("welcome-store-appstore")).toBeNull();
  });

  it("both public: both links", async () => {
    met = ["play-live", "appstore-live"];
    await renderWelcome();
    expect(screen.getByTestId("welcome-store-play")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-store-appstore")).toHaveAttribute("href", "https://apps.apple.com/app/id123");
  });
});

// Round 3, batch E (S3): help before any account on every slide, as the app's pre-account screens
// have it. The page renders it outside the slides, so slides 1–3 all carry it (e2e checks each).
describe("Welcome's help", () => {
  it("the lifebuoy, neutral, with no account's country: the request's decides", async () => {
    met = [];
    await renderWelcome();
    // The link itself (href, name, place, size) is GetHelpNow's: e2e smoke checks it on slides 1–3.
    const help = screen.getByTestId("welcome-help");
    expect(help).toHaveAttribute("data-icon", "true");
    expect(help).toHaveAttribute("data-neutral", "true");
    expect(help).toHaveAttribute("data-country", "null");
  });
});
