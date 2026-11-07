import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Home's store line in the states that need the App Store's id, which doesn't exist yet: each
// store goes public on its own day (decision 185). home.test.tsx has the states without it.
let met: string[] = [];
vi.mock("@/lib/conditions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conditions")>()),
  conditionMet: (id: string) => met.includes(id),
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
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
const { default: HomePage } = await import("./page");
afterEach(cleanup);

const h = messages.home;
const renderHome = async () => render(await HomePage({ params: Promise.resolve({ locale: "en" }) } as PageProps<"/[locale]">));

describe("Home's store line, with the App Store's id set", () => {
  it("the App Store alone: its link, and Google Play's coming soon", async () => {
    met = ["appstore-live"];
    await renderHome();
    expect(screen.getByTestId("home-store-appstore")).toHaveAttribute("href", "https://apps.apple.com/app/id123");
    expect(screen.queryByTestId("home-store-play")).toBeNull();
    expect(screen.getByTestId("home-stores")).toHaveTextContent(h.storeSoonPlay);
  });

  it("both: both links, and nothing coming soon", async () => {
    met = ["play-live", "appstore-live"];
    await renderHome();
    expect(screen.getByTestId("home-store-appstore")).toBeInTheDocument();
    expect(screen.getByTestId("home-store-play")).toBeInTheDocument();
    expect(screen.getByTestId("home-stores")).not.toHaveTextContent(h.storeSoonPlay);
    expect(screen.getByTestId("home-stores")).not.toHaveTextContent(h.storeSoonAppStore);
  });

  it("the flag still decides: with the id set and the flag off, coming soon", async () => {
    met = [];
    await renderHome();
    expect(screen.getByTestId("home-stores")).toHaveTextContent(h.storeSoon);
    expect(screen.getByTestId("home-stores").querySelector("a")).toBeNull();
  });
});
