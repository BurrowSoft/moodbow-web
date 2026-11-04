import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { InsightRow, Range } from "@/lib/journal/insights";

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
