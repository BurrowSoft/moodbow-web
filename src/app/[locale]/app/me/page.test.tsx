import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Me's reads in one round (audit batch D, UX 14 Nov): a slow Plus read (entitlements, then Stripe)
// never costs the help row, export and delete.
const asked: string[] = [];
const query = (table: string) => {
  const c: Record<string, unknown> = {};
  for (const step of ["select", "eq"]) c[step] = () => c;
  c.then = (done: (value: unknown) => unknown) => (asked.push(table), Promise.resolve({ count: 2, error: null }).then(done));
  return c;
};
const client = { from: (table: string) => query(table) };
let plusRead: () => Promise<unknown> = async () => null;
const plusAsked = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/currentUser", () => ({ currentUser: async () => ({ user: { id: "u1" }, ended: false }) }));
vi.mock("@/lib/journal/me", () => ({
  getMe: async () => ({ today: "2026-11-07", profile: { country: null, time_zone: "UTC", locale: "en" }, settings: { reminder_on: true }, credits: { balance: 0 } }),
  hasCurrentConsent: () => false,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: (id: string) => (id === "plus" ? "live" : "hidden"), conditionMet: () => false }));
vi.mock("@/lib/plus/page", () => ({
  readPlusPage: () => {
    plusAsked();
    return plusRead();
  },
}));
vi.mock("@/lib/journal/ai", () => ({ aiShown: () => false, FOCUS_AREAS: [], isTone: () => false }));
vi.mock("@/lib/region/countries", () => ({ countryOptions: () => [], timeZoneOptions: () => [] }));
vi.mock("@/i18n/routing", async (orig) => ({ ...(await orig<typeof import("@/i18n/routing")>()), offeredLocales: () => [], routeLocale: (l: string) => l }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/SafetyCard", () => ({ GetHelpNow: ({ testId }: { testId: string }) => <div data-testid={testId} /> }));
vi.mock("./PlusInMe", () => ({ PlusInMe: () => <div data-testid="plus-in-me" /> }));
vi.mock("./YourData", () => ({ YourData: () => <div data-testid="your-data" /> }));
vi.mock("./AiSettings", () => ({ AiSettings: () => null }));
vi.mock("./Appearance", () => ({ Appearance: () => null }));
vi.mock("./LanguageRegion", () => ({ LanguageRegion: () => null }));
vi.mock("./Reminder", () => ({ Reminder: () => null }));
vi.mock("./ImportData", () => ({ ImportData: () => null }));
vi.mock("./SignOutButton", () => ({ SignOutButton: () => <div data-testid="sign-out" /> }));
vi.mock("@/components/JournalUnavailable", () => ({ JournalUnavailable: () => <div data-testid="journal-unavailable" /> }));
vi.mock("@/components/SessionEnded", () => ({ SessionEnded: () => null }));
const { default: MePage } = await import("./page");

const page = () => MePage({ params: Promise.resolve({ locale: "en" }) } as never);

beforeEach(() => {
  asked.length = 0;
  plusRead = async () => null;
  plusAsked.mockClear();
});
afterEach(cleanup);

describe("Me: a slow Plus read never holds the help row, export and delete (audit batch D)", () => {
  it("Plus never answering: Me renders after 10 s with help, Your data (export and delete) and sign out, nothing about Plus", async () => {
    vi.useFakeTimers();
    try {
      plusRead = () => new Promise(() => {});
      const rendering = page();
      await vi.advanceTimersByTimeAsync(10_000);
      render(await rendering);
      expect(screen.getByTestId("me-get-help")).toBeInTheDocument();
      expect(screen.getByTestId("your-data")).toBeInTheDocument();
      expect(screen.getByTestId("sign-out")).toBeInTheDocument();
      expect(screen.queryByTestId("plus-in-me")).toBeNull();
      expect(screen.queryByTestId("me-past-reports")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the past reports count is asked in the same round as Plus, not after it", async () => {
    let answer: (v: unknown) => void = () => {};
    plusRead = () => new Promise((done) => (answer = done));
    const rendering = page();
    await vi.waitFor(() => expect(plusAsked).toHaveBeenCalledTimes(1), { timeout: 1000 });
    await vi.waitFor(() => expect(asked).toContain("ai_reports"), { timeout: 1000 });
    answer({ view: { kind: "free", trial: false }, price: "US$59.99", offer: null });
    render(await rendering);
    expect(screen.getByTestId("plus-in-me")).toBeInTheDocument();
    expect(screen.getByTestId("me-past-reports")).toBeInTheDocument();
  });

  it("with Plus, the reports stay on Insights: no past reports row here", async () => {
    plusRead = async () => ({ view: { kind: "plus", source: "stripe", daysLeft: null }, price: "US$59.99", offer: null });
    render(await page());
    expect(screen.queryByTestId("me-past-reports")).toBeNull();
    expect(screen.getByTestId("me-get-help")).toBeInTheDocument();
  });
});
