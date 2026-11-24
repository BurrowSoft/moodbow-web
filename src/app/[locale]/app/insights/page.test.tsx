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
const client = { from: (table: string) => chain(table, () => (table === "check_ins" ? checkInsResult : { data: [], error: null, count: table === "ai_reports" ? reportCount : null })) };
let reportCount = 0;
// get_me's answer: AI not available unless a test says so.
const ME = { today: "2026-11-07", profile: { country: null, time_zone: "UTC" }, credits: { balance: 0 } };
let me: Record<string, unknown> = ME;
const AI_ON = { ai_available: true, consents: { ai: { granted: true, version: "2026-12-01" } }, settings: { ai_enabled: true } };
// The gates on: Plus and Patterns; a test adds ai-live (the build shows AI) or weekly-report-live.
let live = new Set(["plus", "patterns-live"]);
const readReflections = vi.fn(async () => ({ rows: [], more: false }));
vi.mock("@/lib/journal/reflections", async (orig) => ({ ...(await orig<typeof import("@/lib/journal/reflections")>()), readReflections: (...a: unknown[]) => readReflections(...(a as [])) }));
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
vi.mock("@/lib/journal/me", async (orig) => ({ ...(await orig<typeof import("@/lib/journal/me")>()), getMe: async () => me }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => (k: string) => k }));
// Plus and Patterns on; the rest off, so the reads are the check-ins and the Plus view.
vi.mock("@/lib/conditions", async (orig) => ({ ...(await orig<typeof import("@/lib/conditions")>()), pageGate: (id: string) => (live.has(id) ? "live" : "hidden") }));
vi.mock("@/lib/plus/view", async (orig) => ({ ...(await orig<typeof import("@/lib/plus/view")>()), readPlusView: (...a: unknown[]) => readPlusView(...(a as [])) }));
vi.mock("@/lib/plus/insightsData", async (orig) => ({ ...(await orig<typeof import("@/lib/plus/insightsData")>()), readCheckInsSince: (...a: unknown[]) => readCheckInsSince(...(a as [])), readWrittenDays: async () => new Set<string>() }));
let viewProps: { rows: InsightRow[]; heading?: boolean } | null = null;
vi.mock("./InsightsView", () => ({
  InsightsView: (p: { rows: InsightRow[] }) => ((viewProps = p), <div data-testid="insights-view" />),
  InsightsHeading: () => <h1 data-testid="insights-heading" />,
}));
vi.mock("./PlusInsights", () => ({ MorePatternsCard: () => null, PlusTabs: () => null }));
vi.mock("./YourWeekCard", () => ({ YourWeekCard: () => null }));
let exampleProps: { heading?: boolean } | null = null;
vi.mock("./InsightsExample", () => ({ InsightsExample: (p: { heading?: boolean }) => ((exampleProps = p), <div data-testid="insights-example" />) }));
vi.mock("./ShareMonth", () => ({ ShareMonth: () => null }));
vi.mock("./WeeklyReport", () => ({ WeeklyReport: () => <div data-testid="weekly-report" /> }));
// The segments and the AI pane (their own tests render them): here, what the page hands them.
let tabsProps: { initial: string; named: boolean; hrefs: Record<string, string> } | null = null;
vi.mock("./InsightsTabs", () => ({
  InsightsTabs: (p: { initial: string; named: boolean; hrefs: Record<string, string>; patterns: React.ReactNode; ai: React.ReactNode }) => (
    (tabsProps = p),
    (
      <div data-testid="tabs">
        {p.patterns}
        {p.ai}
      </div>
    )
  ),
}));
let paneProps: { state: string; reflections?: unknown; week?: React.ReactNode; pastReports?: boolean } | null = null;
vi.mock("./AiPane", () => ({
  AiPane: (p: { state: string; week?: React.ReactNode }) => (
    (paneProps = p),
    (
      <div data-testid={`ai-pane-${p.state}`}>
        {p.week}
      </div>
    )
  ),
  WeekPlusPrompt: () => <div data-testid="week-plus" />,
}));
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

const page = (range?: string, more: Record<string, string> = {}) => InsightsPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ ...(range ? { range } : {}), ...more }) } as never);

beforeEach(() => {
  asked.length = 0;
  checkInsResult = { data: FREE_ROWS, error: null };
  plusView = null;
  plusAnswer = null;
  holdPlus = false;
  viewProps = null;
  exampleProps = null;
  tabsProps = null;
  paneProps = null;
  me = ME;
  live = new Set(["plus", "patterns-live"]);
  reportCount = 0;
  readPlusView.mockClear();
  readCheckInsSince.mockClear();
  readReflections.mockClear();
  window.localStorage.clear();
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

// Insights' Patterns | AI (decision 258; specs/insights-ai-split.md), and the Reviewer's musts for it.
describe("Insights → Patterns | AI (decision 258)", () => {
  const PLUS = { kind: "plus", source: "stripe", daysLeft: null };
  const FREE = { kind: "free", trial: true };

  it("AI not available (the switch off, or this build doesn't show AI): no segments and nothing of AI, whatever's kept or asked", async () => {
    // A kept "ai" from an earlier day with AI, and an address asking for AI: both fall back to Patterns (the Reviewer).
    window.localStorage.setItem("mb:insights-view", "ai");
    for (const [why, who, gates] of [
      ["switch off", { ...ME, ...AI_ON, ai_available: false }, ["plus", "patterns-live", "ai-live", "weekly-report-live"]],
      ["build without AI", { ...ME, ...AI_ON }, ["plus", "patterns-live", "weekly-report-live"]],
    ] as const) {
      for (const view of [PLUS, FREE]) {
        me = who;
        live = new Set(gates);
        plusView = view;
        viewProps = exampleProps = tabsProps = paneProps = null;
        asked.length = 0;
        const { container } = render(await page(undefined, { view: "ai" }));
        const at = `${why}, ${view.kind}`;
        expect(screen.queryByTestId("tabs"), at).toBeNull();
        expect(tabsProps, at).toBeNull();
        expect(paneProps, at).toBeNull();
        expect(screen.queryByTestId("weekly-report"), at).toBeNull();
        expect(screen.queryByTestId("insights-heading"), `${at}: the view's own heading`).toBeNull();
        expect(view.kind === "plus" ? viewProps?.heading : exampleProps?.heading, at).not.toBe(false);
        expect(readReflections, at).not.toHaveBeenCalled();
        expect(asked, `${at}: no AI read`).not.toContain("ai_reports");
        expect(container.textContent ?? "", at).not.toMatch(/\b(AI|IA|KI)\b/);
        cleanup();
      }
    }
  });

  it("AI available, off for this person: the heading above the segments, Patterns first, the AI segment only the invitation", async () => {
    me = { ...ME, ai_available: true, consents: {}, settings: { ai_enabled: false } };
    live = new Set(["plus", "patterns-live", "ai-live", "weekly-report-live"]);
    plusView = PLUS;
    render(await page());
    expect(screen.getByTestId("insights-heading")).toBeInTheDocument();
    expect(tabsProps).toMatchObject({ initial: "patterns", named: false, hrefs: { patterns: "/app/insights", ai: "/app/insights?view=ai" } });
    expect(viewProps?.heading).toBe(false);
    expect(paneProps?.state).toBe("off");
    expect(readReflections).not.toHaveBeenCalled();
    expect(asked).not.toContain("ai_reports");
  });

  it("?view=ai opens on AI (also without scripts), and the tabs' addresses keep the range", async () => {
    me = { ...ME, ...AI_ON };
    live = new Set(["plus", "patterns-live", "ai-live"]);
    plusView = PLUS;
    render(await page("month", { view: "ai" }));
    expect(tabsProps).toMatchObject({ initial: "ai", named: true, hrefs: { patterns: "/app/insights?range=month", ai: "/app/insights?view=ai&range=month" } });
    cleanup();
    render(await page("bogus", { view: "nonsense" }));
    expect(tabsProps).toMatchObject({ initial: "patterns", named: false, hrefs: { patterns: "/app/insights", ai: "/app/insights?view=ai" } });
  });

  it("AI on, with Plus: the 3 newest reflections read with the page's batch, the weekly report in the AI segment, past reports once there's one", async () => {
    me = { ...ME, ...AI_ON };
    live = new Set(["plus", "patterns-live", "ai-live", "weekly-report-live"]);
    plusView = PLUS;
    reportCount = 2;
    render(await page());
    expect(readReflections).toHaveBeenCalledTimes(1);
    expect((readReflections.mock.calls[0] as unknown[])[1]).toBe(3);
    expect(paneProps).toMatchObject({ state: "on", pastReports: true });
    expect(screen.getByTestId("ai-pane-on")).toContainElement(screen.getByTestId("weekly-report"));
    expect(screen.queryByTestId("week-plus")).toBeNull();
    // Patterns keeps everything else, minus the report.
    expect(viewProps?.heading).toBe(false);
    cleanup();
    reportCount = 0;
    render(await page());
    expect(paneProps?.pastReports).toBe(false);
  });

  it("AI on, without Plus: Patterns is the example under the shared heading, and the AI segment's Your week is its Plus line", async () => {
    me = { ...ME, ...AI_ON };
    live = new Set(["plus", "patterns-live", "ai-live", "weekly-report-live"]);
    plusView = FREE;
    reportCount = 3;
    render(await page());
    expect(exampleProps?.heading).toBe(false);
    expect(screen.getByTestId("insights-heading")).toBeInTheDocument();
    expect(paneProps).toMatchObject({ state: "on", pastReports: false });
    expect(screen.getByTestId("week-plus")).toBeInTheDocument();
    expect(screen.queryByTestId("weekly-report")).toBeNull();
    expect(readCheckInsSince).not.toHaveBeenCalled();
  });

  it("AI on, the weekly report not live: the AI segment without Your week", async () => {
    me = { ...ME, ...AI_ON };
    live = new Set(["plus", "patterns-live", "ai-live"]);
    plusView = PLUS;
    render(await page());
    expect(paneProps?.state).toBe("on");
    expect(paneProps?.week).toBeNull();
    expect(asked).not.toContain("ai_reports");
  });
});

// Help everywhere (audit batch H; the Reviewer's guard for #301, which drops What lifts me's own
// lifebuoy): a Plus view's one help control is the lifebuoy by the title, on every range.
describe("Insights with Plus: the page's one help control (audit batch H)", () => {
  it("every range: InsightsView gets the GetHelpNow lifebuoy (insights-help, icon, neutral), and nothing else on the page opens help", async () => {
    const { GetHelpNow } = await import("@/components/SafetyCard");
    for (const range of [undefined, "month", "3months", "year", "all"]) {
      plusView = { kind: "plus", source: "stripe", daysLeft: null };
      viewProps = null;
      render(await page(range));
      const help = (viewProps as unknown as { help?: React.ReactElement<{ testId: string; icon?: boolean; neutral?: boolean }> } | null)?.help;
      expect(help?.type, String(range)).toBe(GetHelpNow);
      expect(help?.props, String(range)).toMatchObject({ testId: "insights-help", icon: true, neutral: true });
      // The rest of the page (the mocked view aside) has no help link of its own.
      expect(document.querySelectorAll('a[href="/help/get-help-now"]'), String(range)).toHaveLength(0);
      cleanup();
    }
  });
});
