import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightRow } from "@/lib/journal/insights";

// Insights' reads (#293 with Plus, #272's merge of master): one parallel batch, Plus's view in it;
// only a Plus user reads once more, further back, after it.
const FREE_ROWS = [{ local_date: "2026-11-06", mood: 3 }] as InsightRow[];
const PLUS_ROWS = [{ local_date: "2025-12-01", mood: 4 }, { local_date: "2026-11-06", mood: 3 }] as InsightRow[];
let checkInsResult: { data: unknown; error: unknown } = { data: FREE_ROWS, error: null };
const asked: string[] = [];
const chain = (table: string, result: () => unknown) => {
  const c: Record<string, unknown> = {};
  for (const step of ["select", "eq", "gte", "lte", "order", "range"]) c[step] = () => c;
  c.maybeSingle = async () => (asked.push(table), result());
  c.then = (done: (value: unknown) => unknown) => (asked.push(table), Promise.resolve(result()).then(done));
  return c;
};
const client = { from: (table: string) => chain(table, () => (table === "check_ins" ? checkInsResult : { data: [], error: null })) };
let plusView: unknown = null;
let plusAnswer: (() => void) | null = null;
let holdPlus = false;
const readPlusView = vi.fn(() => {
  asked.push("entitlements");
  return holdPlus ? new Promise((done) => (plusAnswer = () => done(plusView))) : Promise.resolve(plusView);
});
const readCheckInsSince = vi.fn(async () => PLUS_ROWS);
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/currentUser", () => ({ currentUser: async () => ({ user: { id: "u1" }, ended: false }) }));
vi.mock("@/lib/journal/me", () => ({ getMe: async () => ({ today: "2026-11-07", profile: { country: null, time_zone: "UTC" }, credits: { balance: 0 } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => (k: string) => k }));
// Plus and Patterns on; the rest off, so the reads are the check-ins and the Plus view.
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: (id: string) => (id === "plus" || id === "patterns-live" ? "live" : "hidden") }));
vi.mock("@/lib/plus/view", async (orig) => ({ ...(await orig<typeof import("@/lib/plus/view")>()), readPlusView: (...a: unknown[]) => readPlusView(...(a as [])) }));
vi.mock("@/lib/plus/insightsData", async (orig) => ({ ...(await orig<typeof import("@/lib/plus/insightsData")>()), readCheckInsSince: (...a: unknown[]) => readCheckInsSince(...(a as [])), readWrittenDays: async () => new Set<string>() }));
let viewProps: { rows: InsightRow[] } | null = null;
vi.mock("./InsightsView", () => ({ InsightsView: (p: { rows: InsightRow[] }) => ((viewProps = p), <div data-testid="insights-view" />) }));
vi.mock("./PlusInsights", () => ({ MorePatternsCard: () => null, MorePatternsRow: () => null, PlusTabs: () => null, WeekLine: () => null, YearTab: () => null }));
vi.mock("./YourWeekCard", () => ({ YourWeekCard: () => null }));
vi.mock("./InsightsExample", () => ({ InsightsExample: () => <div data-testid="insights-example" /> }));
vi.mock("./ShareMonth", () => ({ ShareMonth: () => null }));
vi.mock("./WeeklyReport", () => ({ WeeklyReport: () => null }));
vi.mock("@/components/JournalUnavailable", () => ({ JournalUnavailable: () => <div data-testid="journal-unavailable" /> }));
vi.mock("@/components/SessionEnded", () => ({ SessionEnded: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { default: InsightsPage } = await import("./page");

const page = (range?: string) => InsightsPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(range ? { range } : {}) } as never);

beforeEach(() => {
  asked.length = 0;
  checkInsResult = { data: FREE_ROWS, error: null };
  plusView = null;
  plusAnswer = null;
  holdPlus = false;
  viewProps = null;
  readPlusView.mockClear();
  readCheckInsSince.mockClear();
});
afterEach(cleanup);

describe("Insights' reads with Plus (#272 × #293)", () => {
  // Option (a), the Reviewer: #293's single parallel batch stays for everyone (Plus users' LCP);
  // for a free account its rows are simply not used (read on the server, never sent).
  it("the check-ins and the Plus view are asked together, before the view answers", async () => {
    holdPlus = true;
    plusView = { kind: "free", trial: true };
    const rendering = page();
    await vi.waitFor(() => expect([...asked].sort()).toEqual(["check_ins", "entitlements"]), { timeout: 1000 });
    plusAnswer!();
    render(await rendering);
    expect(screen.getByTestId("insights-example")).toBeInTheDocument();
  });

  it("without Plus: the example, nothing of theirs shown, and nothing more is read", async () => {
    plusView = { kind: "free", trial: true };
    render(await page());
    expect(screen.getByTestId("insights-example")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-view")).toBeNull();
    expect(readCheckInsSince).not.toHaveBeenCalled();
  });

  it("a payment that failed (past_due): the example too", async () => {
    plusView = { kind: "past_due" } as typeof plusView;
    render(await page());
    expect(screen.getByTestId("insights-example")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-view")).toBeNull();
  });

  it("the Plus view unreadable: as without Plus, nothing about Plus", async () => {
    plusView = null;
    render(await page());
    expect(readPlusView).toHaveBeenCalledTimes(1);
    expect(readCheckInsSince).not.toHaveBeenCalled();
    expect(viewProps!.rows).toEqual(FREE_ROWS);
  });

  it("with Plus: one read more, further back, after the batch; its rows are the page's", async () => {
    plusView = { kind: "plus", source: "stripe", daysLeft: null };
    render(await page("year"));
    expect(readCheckInsSince).toHaveBeenCalledTimes(1);
    const [, from, today] = readCheckInsSince.mock.calls[0] as unknown as [unknown, string | null, string];
    expect(today).toBe("2026-11-07");
    expect(from! < "2025-11-07").toBe(true);
    expect(viewProps!.rows).toEqual(PLUS_ROWS);
  });

  it("with Plus on All time: from the beginning (null)", async () => {
    plusView = { kind: "plus", source: "stripe", daysLeft: null };
    render(await page("all"));
    expect((readCheckInsSince.mock.calls[0] as unknown as [unknown, string | null])[1]).toBeNull();
  });

  it("the free read failed: the couldn't-load page, as before", async () => {
    checkInsResult = { data: null, error: { message: "boom" } };
    render(await page());
    expect(screen.getByTestId("journal-unavailable")).toBeInTheDocument();
  });
});
