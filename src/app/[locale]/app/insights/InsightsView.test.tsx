import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { InsightRow, Range } from "@/lib/journal/insights";
import type { Pattern } from "@/lib/journal/patterns";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { InsightsView } = await import("./InsightsView");

const row = (local_date: string, mood: number, extra: Partial<InsightRow> = {}): InsightRow => ({ local_date, mood, sleep_hours: null, stress: null, exercise_minutes: null, ...extra });
const renderView = (rows: InsightRow[], range: Range = "week") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InsightsView rows={rows} today="2026-10-02" range={range} />
    </NextIntlClientProvider>,
  );
afterEach(cleanup);

const thisWeek = [
  row("2026-09-28", 4, { sleep_hours: 7, stress: 2, exercise_minutes: 30 }),
  row("2026-09-30", 4, { sleep_hours: "8", stress: 3, exercise_minutes: 0 }),
  row("2026-10-02", 5, { sleep_hours: 7.5, stress: 1 }),
];
const lastWeek = [row("2026-09-20", 3, { stress: 2 }), row("2026-09-22", 4, { stress: 2 }), row("2026-09-24", 4, { stress: 2 })];

describe("InsightsView", () => {
  it("help everywhere (audit batch H): the help slot sits on the title row, after the title", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InsightsView rows={[]} today="2026-10-02" range="month" help={<span data-testid="insights-help" />} />
      </NextIntlClientProvider>,
    );
    const title = screen.getByRole("heading", { level: 1 });
    const help = screen.getByTestId("insights-help");
    expect(title.parentElement).toContainElement(help);
    expect(title.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(help.compareDocumentPosition(screen.getByTestId("insights-range-week")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("range tabs (Week current), with the spec's test ids", () => {
    renderView([]);
    expect(screen.getByTestId("insights-range-week")).toHaveAttribute("aria-current", "page");
    // The selected segment in the rose accent with on-accent text (colour-roles §3, UX).
    expect(screen.getByTestId("insights-range-week").classList.contains("bg-accent")).toBe(true);
    expect(screen.getByTestId("insights-range-week").classList.contains("text-on-accent")).toBe(true);
    expect(screen.getByTestId("insights-range-month").classList.contains("bg-accent")).toBe(false);
    expect(screen.getByTestId("insights-range-month")).toHaveAttribute("href", "/app/insights?range=month");
    expect(screen.getByTestId("insights-range-3months")).toHaveTextContent(messages.insights.range3Months);
  });

  it("fewer than 3 points: each chart says how many more days (#9765 S-02)", () => {
    renderView([row("2026-10-02", 3), row("2026-10-01", 4, { sleep_hours: 7 })]);
    expect(screen.getByTestId("insights-not-enough-mood")).toHaveTextContent("Check in on 1 more day to see your charts.");
    expect(screen.getByTestId("insights-not-enough-sleep")).toHaveTextContent("Add sleep on 2 more days to see this chart.");
    expect(screen.getByTestId("insights-not-enough-stress")).toHaveTextContent("Add stress on 3 more days to see this chart.");
    expect(screen.getByTestId("insights-not-enough-exercise")).toHaveTextContent("Add movement on 3 more days to see this chart.");
    for (const m of ["mood", "sleep", "stress", "exercise"]) {
      expect(within(screen.getByTestId(`insights-chart-${m}`)).queryByRole("img")).toBeNull();
    }
  });

  it("averages with their scale or unit; exercise 0 counts; 3 points needed per chart", () => {
    renderView(thisWeek);
    expect(screen.getByTestId("insights-average-mood")).toHaveTextContent("Average 4.3 / 5");
    expect(screen.getByTestId("insights-average-sleep")).toHaveTextContent("Average 7.5 h");
    expect(screen.getByTestId("insights-average-stress")).toHaveTextContent("Average 2.0 / 5");
    // Exercise has only 2 values (30, 0): not enough.
    expect(screen.getByTestId("insights-not-enough-exercise")).toBeInTheDocument();
  });

  it("the change vs the previous range: 'Up'/'Down' in words (decision 137); none without previous data", () => {
    renderView([...thisWeek, ...lastWeek]);
    expect(screen.getByTestId("insights-change-mood")).toHaveTextContent("Up 0.6 vs the previous week");
    expect(screen.getByTestId("insights-change-stress")).toHaveTextContent("Same as the previous week");
    expect(screen.queryByTestId("insights-change-sleep")).toBeNull();
  });

  it("a fall reads 'Down', in the same neutral ink as a rise (decision 98)", () => {
    const better = [row("2026-09-20", 5), row("2026-09-22", 5), row("2026-09-24", 5)];
    renderView([...thisWeek, ...better]);
    const change = screen.getByTestId("insights-change-mood");
    expect(change).toHaveTextContent("Down 0.7 vs the previous week");
    expect(change.className).toBe("text-muted");
  });

  it("3 months reads '3 months' in the sentence", () => {
    const rows = [row("2026-08-01", 4), row("2026-09-01", 4), row("2026-10-01", 4), row("2026-05-10", 3), row("2026-06-01", 3), row("2026-06-20", 3)];
    renderView(rows, "3months");
    expect(screen.getByTestId("insights-change-mood")).toHaveTextContent("Up 1.0 vs the previous 3 months");
  });

  it("line dots: every day on Week and Month, only isolated days on 3 months (app parity)", () => {
    // Three days in a row, and one alone (empty on both sides).
    const rows = [row("2026-09-29", 4, { stress: 2 }), row("2026-09-30", 3, { stress: 3 }), row("2026-10-01", 4, { stress: 2 }), row("2026-09-27", 2, { stress: 4 })];
    const dots = (metric: string) => screen.getByTestId(`insights-chart-${metric}`).querySelectorAll("g[data-value-colour]").length;
    for (const range of ["week", "month"] as const) {
      renderView(rows, range);
      expect(dots("mood"), range).toBe(4);
      expect(dots("stress"), range).toBe(4);
      cleanup();
    }
    renderView(rows, "3months");
    expect(dots("mood")).toBe(1);
    expect(dots("stress")).toBe(1);
  });

  it("a drawn chart is an image named by its title and summary", () => {
    renderView(thisWeek);
    const img = within(screen.getByTestId("insights-chart-mood")).getByRole("img");
    expect(img).toHaveAccessibleName(`${messages.insights.chartMood} Average 4.3 / 5`);
  });
});

describe("InsightsView: number format (app parity)", () => {
  it("one decimal always for mood, stress and sleep; whole minutes for exercise", () => {
    const rows = [
      row("2026-09-28", 4, { sleep_hours: 7, stress: 3, exercise_minutes: 30 }),
      row("2026-09-29", 4, { sleep_hours: 7, stress: 3, exercise_minutes: 30 }),
      row("2026-09-30", 4, { sleep_hours: 7, stress: 3, exercise_minutes: 30 }),
    ];
    renderView(rows);
    expect(screen.getByTestId("insights-average-mood")).toHaveTextContent("Average 4.0 / 5");
    expect(screen.getByTestId("insights-average-sleep")).toHaveTextContent("Average 7.0 h");
    expect(screen.getByTestId("insights-average-exercise")).toHaveTextContent("Average 30 min");
  });
});

// Patterns (no AI): the sentences in their fixed order, "about the same"
// with both numbers, a short pattern left out, one line when nothing shows,
// nothing at all where the card is off.
describe("InsightsView: Patterns", () => {
  const renderPatterns = (patterns?: Pattern[]) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InsightsView rows={[]} today="2026-10-02" range="week" patterns={patterns} />
      </NextIntlClientProvider>,
    );
  const side = (days: number, mood: number) => ({ days, mood });

  it("shown and same sentences, one decimal always, the short one left out, the footnote", () => {
    renderPatterns([
      { id: "sleep", state: "shown", a: side(10, 4), b: side(8, 3.4), diff: 0.6 },
      { id: "movement", state: "not_enough", a: null, b: null, diff: null },
      { id: "stress", state: "same", a: side(6, 3.5), b: side(5, 3.2), diff: 0.3 },
    ]);
    const card = screen.getByTestId("insights-patterns");
    expect(within(card).getByRole("heading", { name: messages.insights.patternsTitle })).toBeInTheDocument();
    expect(card).toHaveTextContent(messages.insights.patternsSubtitle);
    expect(screen.getByTestId("insights-pattern-sleep")).toHaveTextContent("On days after 7 or more hours of sleep, your mood averaged 4.0 of 5. After less sleep, 3.4.");
    expect(screen.getByTestId("insights-pattern-stress")).toHaveTextContent("On low- and high-stress days, your mood was about the same (3.5 and 3.2 of 5).");
    expect(screen.queryByTestId("insights-pattern-movement")).toBeNull();
    expect(within(card).getAllByRole("listitem").map((li) => li.getAttribute("data-testid"))).toEqual(["insights-pattern-sleep", "insights-pattern-stress"]);
    expect(screen.getByTestId("insights-patterns-footnote")).toHaveTextContent(messages.insights.patternsFootnote);
    expect(screen.queryByTestId("insights-patterns-none")).toBeNull();
  });

  it("nothing shown or same: the one line, no footnote", () => {
    renderPatterns((["sleep", "movement", "stress"] as const).map((id) => ({ id, state: "not_enough" as const, a: null, b: null, diff: null })));
    expect(screen.getByTestId("insights-patterns-none")).toHaveTextContent(messages.insights.patternsNone);
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByTestId("insights-patterns-footnote")).toBeNull();
  });

  it("off (patterns-live hidden): no card", () => {
    renderPatterns(undefined);
    expect(screen.queryByTestId("insights-patterns")).toBeNull();
  });
});

describe("InsightsView: Plus's Year and All time (someone with Plus)", () => {
  const charts = {
    mood: { points: [3, null, 4], enough: true, average: 3.5, change: 0.5 },
    sleep: { points: [null, null, null], enough: false, average: null, change: null },
    stress: { points: [2, 2, 2], enough: true, average: 2, change: 0 },
    exercise: { points: [20, 30, 10], enough: true, average: 20, change: null },
  };
  const renderLong = (range: "year" | "all", unit: "month" | "quarter") =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InsightsView rows={[]} today="2026-11-11" range="week" long={{ range, unit, periodLine: "Dec 2025 – Nov 2026", charts }} />
      </NextIntlClientProvider>,
    );

  it("Year: its subtitle and months, the year-before line, a not-enough chart, and the footnote; no free tab is current", () => {
    renderLong("year", "month");
    const p = messages.plus;
    expect(screen.getByTestId("insights-long-heading")).toHaveTextContent(p.yearSubtitle);
    expect(screen.getByTestId("insights-long-period")).toHaveTextContent("Dec 2025 – Nov 2026");
    expect(screen.getByTestId("insights-change-mood")).toHaveTextContent("Up 0.5 vs the year before");
    expect(screen.getByTestId("insights-change-stress")).toHaveTextContent(p.longChangeSame);
    expect(screen.queryByTestId("insights-change-exercise")).toBeNull();
    expect(screen.getByTestId("insights-not-enough-sleep")).toHaveTextContent(p.longNotEnough);
    expect(screen.getByTestId("insights-long-footnote")).toHaveTextContent(p.longFootnoteMonth);
    expect(screen.getByTestId("insights-range-week")).not.toHaveAttribute("aria-current");
  });

  it("All time by quarter: its subtitle and footnote", () => {
    renderLong("all", "quarter");
    expect(screen.getByTestId("insights-long-heading")).toHaveTextContent(messages.plus.allSubtitleQuarter);
    expect(screen.getByTestId("insights-long-footnote")).toHaveTextContent(messages.plus.longFootnoteQuarter);
  });
});
