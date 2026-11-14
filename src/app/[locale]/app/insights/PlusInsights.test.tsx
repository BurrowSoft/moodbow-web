import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { periodLine } from "@/lib/plus/insightsData";
import type { MorePattern } from "@/lib/plus/morePatterns";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { MorePatternsCard, PlusTabs, YearTab } = await import("./PlusInsights");
const m = messages.plus;
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
afterEach(cleanup);

const side = (days: number, mood: number) => ({ days, mood });
const shown = (id: MorePattern["id"], a: number, b: number): MorePattern => ({ id, state: "shown", a: side(10, a), b: side(10, b) });

describe("Plus tabs on Insights", () => {
  it("without Plus: Year and All time locked, each a link to the Plus screen (the sheet is retired)", () => {
    wrap(<YearTab offer={{ trial: true, price: "US$59.99" }} />);
    expect(screen.getByTestId("insights-range-year")).toHaveAttribute("data-locked", "");
    expect(screen.getByTestId("insights-range-year")).toHaveAttribute("href", "/app/me/plus");
    expect(screen.getByTestId("insights-range-all")).toHaveTextContent(m.tabAllTime);
  });
  it("with Plus: real tabs, the current one marked", () => {
    wrap(<PlusTabs current="all" />);
    expect(screen.getByTestId("insights-range-year")).toHaveAttribute("href", "/app/insights?range=year");
    expect(screen.getByTestId("insights-range-all")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("insights-range-year")).not.toHaveAttribute("aria-current");
  });
});

describe("MorePatternsCard", () => {
  it("today's lines for the three factors, the new ones for weekdays and writing, in order, with the footnote", () => {
    wrap(<MorePatternsCard window="year" patterns={[shown("sleep", 4, 3), shown("weekdays", 4, 2.5), { id: "writing", state: "same", a: side(9, 3.2), b: side(9, 3) }, { id: "stress", state: "not_enough", a: null, b: null }]} />);
    expect(screen.getByText(m.moreSubtitleYear)).toBeInTheDocument();
    expect(screen.getByTestId("insights-more-pattern-sleep")).toHaveTextContent("On days after 7 or more hours of sleep, your mood averaged 4.0 of 5. After less sleep, 3.0.");
    expect(screen.getByTestId("insights-more-pattern-weekdays")).toHaveTextContent("On weekdays, your mood averaged 4.0 of 5. At weekends, 2.5.");
    expect(screen.getByTestId("insights-more-pattern-writing")).toHaveTextContent("On days you wrote and days you didn't, your mood was about the same (3.2 and 3.0 of 5).");
    expect(screen.queryByTestId("insights-more-pattern-stress")).toBeNull();
    expect(screen.getByText(messages.insights.patternsFootnote)).toBeInTheDocument();
  });
  it("all time's subtitle; nothing to show is one line", () => {
    wrap(<MorePatternsCard window="all" patterns={[{ id: "sleep", state: "not_enough", a: null, b: null }]} />);
    expect(screen.getByText(m.moreSubtitleAll)).toBeInTheDocument();
    expect(screen.getByTestId("insights-more-patterns-none")).toHaveTextContent(m.moreNone);
  });
});

describe("periodLine: the browser's own month names", () => {
  it("first month to last month", () => {
    const line = periodLine("2025-12-01", "2026-12-01", "en-GB");
    expect(line).toMatch(/Dec 2025/);
    expect(line).toMatch(/Nov 2026/);
  });
});
