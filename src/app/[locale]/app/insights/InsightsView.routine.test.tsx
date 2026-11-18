import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { routineLines, type RoutineLine } from "@/lib/journal/patterns";
import type { InsightRow } from "@/lib/journal/insights";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { InsightsView } = await import("./InsightsView");
afterEach(cleanup);

const view = (routinePatterns: RoutineLine[] | undefined) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InsightsView rows={[]} today="2026-11-18" range="week" patterns={[]} routinePatterns={routinePatterns} />
    </NextIntlClientProvider>,
  );

describe("Routine patterns on Insights (1.4 F, UX's safety ruling)", () => {
  it("each shown line in the app's words, and the caution once under them", () => {
    view([
      { id: "a", name: "Morning meds", a: 3.8, b: 3.1 },
      { id: "b", name: "Walk outside", a: 4, b: 3 },
    ]);
    expect(screen.getAllByTestId("insights-routine-pattern").map((l) => l.textContent)).toEqual([
      "On days you ticked Morning meds, your mood averaged 3.8 of 5. On other days, 3.1.",
      "On days you ticked Walk outside, your mood averaged 4 of 5. On other days, 3.",
    ]);
    expect(screen.getAllByTestId("insights-routine-footnote")).toHaveLength(1);
    expect(screen.getByTestId("insights-routine-footnote")).toHaveTextContent(messages.routine.patternFootnote);
    // With routine lines, "patterns show up once you have more" is wrong: it isn't said.
    expect(screen.queryByTestId("insights-patterns-none")).toBeNull();
  });

  it("no routine line: no caution, and the usual empty line", () => {
    view([]);
    expect(screen.queryByTestId("insights-routine-footnote")).toBeNull();
    expect(screen.getByTestId("insights-patterns-none")).toBeInTheDocument();
    cleanup();
    view(undefined);
    expect(screen.queryByTestId("insights-routine-patterns")).toBeNull();
  });

  it("routineLines: only higher-on-ticked lines, never a lower or same one, with the item's name", () => {
    const today = "2026-11-18";
    const days = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 10, 18 - i)).toISOString().slice(0, 10));
    const rows: InsightRow[] = days.map((local_date, i) => ({ local_date, mood: i % 2 === 0 ? 5 : 2, sleep_hours: null, stress: null, exercise_minutes: null }));
    const even = days.filter((_, i) => i % 2 === 0);
    const odd = days.filter((_, i) => i % 2 === 1);
    const items = [
      { id: "up", name: "Walk", position: 0, started_on: "2026-01-01", ticks: even },
      { id: "down", name: "Morning meds", position: 1, started_on: "2026-01-01", ticks: odd },
    ];
    expect(routineLines(rows, today, items)).toEqual([{ id: "up", name: "Walk", a: 5, b: 2 }]);
  });
});
