import { cleanup, render, screen, within } from "@testing-library/react";
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
  it("without Plus: Year and All time locked, a tap opens the sheet", () => {
    wrap(<YearTab offer={{ trial: true, price: "US$59.99" }} />);
    expect(screen.getByTestId("insights-range-year")).toHaveAttribute("data-locked", "");
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
    // Board 3 (UX, 14 Nov): the sentence is the bars' image name; shown are the title and the row labels.
    const named = (id: string) => within(screen.getByTestId(id)).getByRole("img");
    expect(named("insights-more-pattern-sleep")).toHaveAccessibleName("On days after 7 or more hours of sleep, your mood averaged 4.0 of 5. After less sleep, 3.0.");
    expect(named("insights-more-pattern-weekdays")).toHaveAccessibleName("On weekdays, your mood averaged 4.0 of 5. At weekends, 2.5.");
    expect(named("insights-more-pattern-writing")).toHaveAccessibleName("On days you wrote and days you didn't, your mood was about the same (3.2 and 3.0 of 5).");
    const i = messages.insights;
    expect(screen.getByTestId("insights-more-pattern-weekdays")).toHaveTextContent(`${i.pairWeekTitle}+1.5${i.pairWeekdays}4.0${i.pairWeekends}2.5`);
    expect(screen.getByTestId("insights-more-pattern-writing")).toHaveTextContent(`${i.pairWritingTitle}+0.2${i.pairWrote}3.2${i.pairNotWrote}3.0`);
    expect(screen.getByTestId("insights-more-pattern-sleep").textContent).not.toContain("averaged");
    expect(screen.queryByTestId("insights-more-pattern-stress")).toBeNull();
    expect(screen.getByText(messages.insights.patternsFootnote)).toBeInTheDocument();
  });
  // More patterns by tag (UX, 12 Nov): its own heading, each tag quoted as written, in the order
  // given (lib/plus/tagPatterns picks and orders them), the same footnote.
  it("your tags: the heading, each tag's line as approved, in order, with the footnote", () => {
    wrap(
      <MorePatternsCard
        window="year"
        patterns={[shown("sleep", 4, 3)]}
        tags={[
          { tag: "walk", state: "shown", a: side(8, 4), b: side(12, 3.5) },
          { tag: "<b>work</b>", state: "same", a: side(9, 3.2), b: side(11, 3) },
        ]}
      />,
    );
    const tags = screen.getByTestId("insights-more-tags");
    expect(tags).toHaveTextContent(m.moreTagsTitle);
    const lines = screen.getAllByTestId("insights-more-tag");
    // Board 3: the sentence is the bars' image name only; shown, the quoted tag and "With {tag}" / "Other days".
    expect(lines[0]).toHaveTextContent("“walk”+0.5With walk4.0Other days3.5");
    expect(lines.map((l) => l.textContent?.includes("averaged"))).toEqual([false, false]);
    expect(lines.map((l) => l.querySelector("[role=img]")?.getAttribute("aria-label"))).toEqual([
      "On days tagged “walk”, your mood averaged 4.0 of 5. On other days, 3.5.",
      "On days tagged “<b>work</b>” and other days, your mood was about the same (3.2 and 3.0 of 5).",
    ]);
    // Plain text, never markup.
    expect(tags.querySelector("b")).toBeNull();
    expect(screen.getByText(messages.insights.patternsFootnote)).toBeInTheDocument();
  });
  it("only tags to show: the tags and the footnote, not the empty line; no tags: no heading", () => {
    wrap(<MorePatternsCard window="year" patterns={[{ id: "sleep", state: "not_enough", a: null, b: null }]} tags={[{ tag: "walk", state: "shown", a: side(8, 4), b: side(12, 3) }]} />);
    expect(screen.getByTestId("insights-more-tags")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-more-patterns-none")).toBeNull();
    expect(screen.getByText(messages.insights.patternsFootnote)).toBeInTheDocument();
    cleanup();
    wrap(<MorePatternsCard window="year" patterns={[shown("sleep", 4, 3)]} />);
    expect(screen.queryByTestId("insights-more-tags")).toBeNull();
    expect(screen.queryByText(m.moreTagsTitle)).toBeNull();
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

// What lifts me (1.3 part 2): inside More patterns, the lines as given (lib/plus/whatLiftsMe picks
// and orders them), its own footer, the quiet help beside its title; with none, the invitation;
// with tags off or unread (null), nothing.
describe("MorePatternsCard: What lifts me", () => {
  const notEnough: MorePattern[] = [{ id: "sleep", state: "not_enough", a: null, b: null }];
  it("the lines in order, as written, with the averages to one decimal; the footer and Get help now", () => {
    wrap(<MorePatternsCard window="year" patterns={notEnough} lifts={[{ tag: "Walk <b>", a: side(6, 4.2), b: side(20, 3), gap: 1.2 }, { tag: "Tea", a: side(5, 3.6), b: side(21, 3.2), gap: 0.4 }]} country="NZ" />);
    const section = screen.getByTestId("insights-lifts");
    expect(section).toHaveTextContent(m.liftsTitle);
    const lifts = screen.getAllByTestId("insights-lift");
    // Board 3: a header row (the quoted tag, the chip) and labelled rows; the sentence, with "of 5",
    // is the image's name only.
    expect(lifts[1]).toHaveTextContent("“Tea”+0.4With Tea3.6Other days3.2");
    expect(lifts.map((li) => li.textContent?.includes("averaged"))).toEqual([false, false]);
    expect(m.liftsRow).toContain("of 5");
    expect(lifts.map((li) => li.querySelector("[role=img]")?.getAttribute("aria-label"))).toEqual([
      m.liftsRow.replace("{tag}", "Walk <b>").replace("{a}", "4.2").replace("{b}", "3.0"),
      m.liftsRow.replace("{tag}", "Tea").replace("{a}", "3.6").replace("{b}", "3.2"),
    ]);
    expect(section.querySelector("b")).toBeNull();
    expect(screen.getByTestId("insights-lifts-footer")).toHaveTextContent(m.liftsFooter);
    // No help control of its own: the page's one lifebuoy is by the Insights title (audit batch H).
    expect(screen.queryByTestId("lifts-get-help")).toBeNull();
    expect(screen.queryByRole("link", { name: messages.me.meGetHelpNow })).toBeNull();
    expect(screen.queryByTestId("insights-lifts-none")).toBeNull();
  });
  it("none qualifies: the invitation to keep tagging, still with the footer (help is the page's)", () => {
    wrap(<MorePatternsCard window="year" patterns={notEnough} lifts={[]} />);
    expect(screen.getByTestId("insights-lifts-none")).toHaveTextContent(m.liftsNone);
    expect(screen.queryByTestId("insights-lift")).toBeNull();
    expect(screen.queryByTestId("lifts-get-help")).toBeNull();
  });
  it("tags off or not read: no section at all", () => {
    wrap(<MorePatternsCard window="year" patterns={notEnough} lifts={null} />);
    expect(screen.queryByTestId("insights-lifts")).toBeNull();
    wrap(<MorePatternsCard window="year" patterns={notEnough} />);
    expect(screen.queryByTestId("insights-lifts")).toBeNull();
  });
});
