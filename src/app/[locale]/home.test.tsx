import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The home page's two lives (launch readiness, UX): before and after the web
// journal and AI go live. The conditions are mocked; the e2e smoke covers
// today's build in a real browser.
let met: string[] = [];
vi.mock("@/lib/conditions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conditions")>()),
  conditionMet: (id: string) => met.includes(id),
}));
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

describe("Home page", () => {
  it("before launch: Coming soon and Get notified; no AI claim; text-only store line", async () => {
    met = [];
    await renderHome();
    expect(screen.getByTestId("home-coming-soon")).toHaveTextContent(h.comingSoon);
    expect(screen.getByTestId("home-notify")).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
    expect(screen.queryByTestId("home-start")).toBeNull();
    expect(screen.getByTestId("home-feature-write")).toHaveTextContent(h.featureWriteNoAiTitle);
    expect(screen.getByTestId("home-stores").querySelector("a")).toBeNull();
  });

  it("JSON-LD (launch SEO): none before launch; with the web journal live, a free SoftwareApplication naming only Web", async () => {
    met = [];
    await renderHome();
    expect(screen.queryByTestId("home-jsonld")).toBeNull();
    cleanup();
    met = ["web-journal-live"];
    await renderHome();
    const ld = JSON.parse(screen.getByTestId("home-jsonld").textContent ?? "");
    expect(ld).toMatchObject({ "@type": "SoftwareApplication", name: "Moodbow", operatingSystem: "Web", offers: { price: "0" } });
    expect(screen.getByTestId("home-jsonld")).toHaveAttribute("type", "application/ld+json");
  });

  it("store line (decision 185): Play live alone gives its link and the App Store's coming soon", async () => {
    met = ["play-live"];
    await renderHome();
    const stores = screen.getByTestId("home-stores");
    expect(stores).toHaveTextContent(h.storeGetApp);
    expect(screen.getByTestId("home-store-play")).toHaveAttribute("href", "https://play.google.com/store/apps/details?id=com.burrowsoft.moodbow");
    expect(screen.getByTestId("home-store-play")).toHaveTextContent(h.storeGooglePlay);
    expect(stores).toHaveTextContent(h.storeSoonAppStore);
    expect(stores).not.toHaveTextContent(h.storeSoon);
  });

  it("store line: appstore-live without the listing's link yet still says coming soon (no dead link)", async () => {
    met = ["appstore-live"];
    await renderHome();
    expect(screen.getByTestId("home-stores")).toHaveTextContent(h.storeSoon);
    expect(screen.getByTestId("home-stores").querySelector("a")).toBeNull();
  });

  it("once the web journal is live: Start your journal and I already have an account; no Coming soon", async () => {
    met = ["web-journal-live"];
    await renderHome();
    expect(screen.queryByTestId("home-coming-soon")).toBeNull();
    expect(screen.queryByTestId("home-notify")).toBeNull();
    expect(screen.getByTestId("home-start")).toHaveAttribute("href", "/welcome");
    expect(screen.getByTestId("home-start")).toHaveTextContent(h.start);
    expect(screen.getByTestId("home-sign-in")).toHaveAttribute("href", "/sign-in");
  });

  it("once AI is live: Write it. Moodbow writes back.", async () => {
    met = ["web-journal-live", "ai-live"];
    await renderHome();
    expect(screen.getByTestId("home-feature-write")).toHaveTextContent(h.featureWriteTitle);
    expect(screen.getByTestId("home-feature-write")).toHaveTextContent(h.featureWriteBody);
  });

  it("the arc: one Sunrise band per day, decorative", async () => {
    met = [];
    await renderHome();
    const arc = screen.getByTestId("moodbow-arc");
    expect(arc).toHaveAttribute("aria-hidden", "true");
    expect(arc.querySelectorAll("path.arc-band").length).toBeGreaterThan(10);
  });
});
