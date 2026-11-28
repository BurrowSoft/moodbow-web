import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { InsightsExample } = await import("./InsightsExample");
const m = messages.plus;
afterEach(cleanup);
const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InsightsExample help={<button type="button" data-testid="insights-example-help" />} />
    </NextIntlClientProvider>,
  );

describe("InsightsExample (Insights become Plus, rulings 3 and 4)", () => {
  // Its own heading shows only where AI isn't (heading = !available), so "Insights" there; given
  // ai, it names Insights as the tab does (UX, 27 Nov).
  it("its heading: Insights by default and without AI; AI & Insights with AI", () => {
    show();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(messages.insights.insightsTitleNoAi);
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InsightsExample ai />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(messages.insights.insightsTitle);
  });

  it("the strip says it's an example, with See Plus; help is there; no lock anywhere", () => {
    show();
    expect(screen.getByTestId("insights-example-strip")).toHaveTextContent(m.exampleStrip);
    expect(screen.getByTestId("insights-example-see")).toHaveAttribute("href", "/app/me/plus");
    expect(screen.getByTestId("insights-example-help")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: m.lock })).toBeNull();
  });
  it("the sample area is ONE link to the Plus screen, named by the strip and See Plus; its numbers are hidden from screen readers", () => {
    show();
    const sample = screen.getByTestId("insights-example-sample");
    expect(sample).toHaveAttribute("href", "/app/me/plus");
    expect(sample).toHaveAccessibleName(`${m.exampleStrip} ${m.seePlus}`);
    expect(sample.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(sample.querySelectorAll("a, button")).toHaveLength(0);
  });
  it("the range chips switch the example (the only taps besides the tab bar, Back and help that don't open Plus)", () => {
    show();
    expect(screen.getByTestId("insights-example-range-week")).toHaveAttribute("aria-pressed", "true");
    // Week (board 3): Mood this week's 7 bars and its sentence, then What lifts me's pairs, then Patterns. Not named
    // "Your week" any more: that's the AI report's name in Insights → AI (UX, 25 Nov, decision 258).
    const week = screen.getByTestId("insights-example-week");
    expect(week.querySelectorAll("span.flex-1")).toHaveLength(7);
    expect(week).toHaveTextContent(messages.insights.insightsMoodThisWeek);
    expect(week).not.toHaveTextContent(messages.insights.yourWeekTitle);
    expect(week).toHaveTextContent(m.exampleWeekLine);
    expect(screen.getByTestId("insights-example-lifts")).toHaveTextContent(`“${m.exampleTagWalk}”`);
    expect(screen.getByTestId("insights-example-lifts")).toHaveTextContent(messages.insights.pairOther);
    expect(screen.getByTestId("insights-example-patterns")).toHaveTextContent(messages.insights.pairSleepMore);
    expect(screen.queryByTestId("insights-example-mood")).toBeNull();
    // Month, 3 months, Year: the four cards (boards 11-13).
    fireEvent.click(screen.getByTestId("insights-example-range-month"));
    expect(screen.getByTestId("insights-example-mood").querySelectorAll("span.flex-1")).toHaveLength(30);
    expect(screen.queryByTestId("insights-example-week")).toBeNull();
    fireEvent.click(screen.getByTestId("insights-example-range-year"));
    expect(screen.getByTestId("insights-example-range-year")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("insights-example-mood").querySelectorAll("span.flex-1")).toHaveLength(12);
    for (const metric of ["sleep_hours", "stress", "exercise_minutes"]) expect(screen.getByTestId(`insights-example-${metric}`)).toBeInTheDocument();
  });
  it("the EXAMPLE watermark: hidden from screen readers, never catching a tap, scaled to fit whole", () => {
    show();
    const mark = screen.getByTestId("insights-example-watermark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark.getAttribute("class")).toContain("pointer-events-none");
    expect(mark).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(mark.textContent).toBe(m.exampleWatermark);
  });
});
