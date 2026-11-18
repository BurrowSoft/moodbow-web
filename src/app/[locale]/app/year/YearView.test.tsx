import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import contract from "@/lib/journal/yearReview.contract.json";
import { yearReview, type YearReview } from "@/lib/journal/yearReview";
import type { InsightRow } from "@/lib/journal/insights";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { YearView } from "./YearView";

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string, v?: Record<string, unknown>) => (v ? `${key} ${JSON.stringify(v)}` : key) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/SafetyCard", () => ({ GetHelpNow: ({ testId, counted }: { testId: string; counted?: boolean }) => <button data-testid={testId} data-counted={String(!!counted)} /> }));
vi.mock("../insights/ShareMonth", () => ({ ShareMonth: ({ testId, yearOnly, year }: { testId: string; yearOnly?: boolean; year: number }) => <button data-testid={testId} data-year-only={String(!!yearOnly)} data-year={year} /> }));
afterEach(cleanup);

type Tuple = [string, number, number | null, number | null, number | null];
const reviewOf = (i: number): YearReview => {
  const c = contract.cases[i];
  const checkIns: InsightRow[] = (c.checkIns as Tuple[]).map(([local_date, mood, sleep_hours, exercise_minutes, stress]) => ({ local_date, mood, sleep_hours, exercise_minutes, stress }));
  return yearReview({ today: c.today, checkIns, moments: c.moments, helps: c.helps, tags: c.tags, keywords: CRISIS_KEYWORDS });
};
// Case A with five okay days in March too: three coloured months, so the Year card can draw.
const threeMonths = (): YearReview => {
  const c = contract.cases[0];
  const checkIns: InsightRow[] = [...(c.checkIns as Tuple[]), ...[1, 2, 3, 4, 5].map((d): Tuple => [`2026-03-0${d}`, 3, null, null, null])].map(([local_date, mood, sleep_hours, exercise_minutes, stress]) => ({ local_date, mood, sleep_hours, exercise_minutes, stress }));
  return yearReview({ today: c.today, checkIns, moments: c.moments, helps: c.helps, tags: c.tags, keywords: CRISIS_KEYWORDS });
};
const view = async (review: YearReview, extra: Partial<{ share: boolean; morePlus: boolean }> = {}) =>
  render(await YearView({ review, country: "NZ", dateLocaleTag: "en-NZ", share: true, morePlus: false, ...extra }));
const shown = () => screen.getAllByTestId(/^year-screen-/).filter((el) => !el.hidden);

describe("YearView", () => {
  it("one screen at a time; Next and Previous move through all of them", async () => {
    await view(reviewOf(0));
    expect(screen.getAllByTestId(/^year-screen-/).map((el) => el.dataset.testid)).toEqual(["year-screen-colours", "year-screen-days", "year-screen-moments", "year-screen-helped", "year-screen-pattern", "year-screen-closing"]);
    expect(shown().map((el) => el.dataset.testid)).toEqual(["year-screen-colours"]);
    expect(screen.getByTestId("year-previous")).toHaveProperty("disabled", true);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByTestId("year-next"));
    expect(shown().map((el) => el.dataset.testid)).toEqual(["year-screen-closing"]);
    expect(screen.getByTestId("year-next")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByTestId("year-previous"));
    expect(shown().map((el) => el.dataset.testid)).toEqual(["year-screen-pattern"]);
    expect(screen.getByTestId("year-position").textContent).toBe('position {"n":5,"total":6}');
  });

  it("a swipe moves one screen, a short drag doesn't", async () => {
    await view(reviewOf(0));
    const region = screen.getByTestId("year-carousel");
    fireEvent.touchStart(region, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 280 }] });
    expect(shown()[0].dataset.testid).toBe("year-screen-colours");
    fireEvent.touchStart(region, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 100 }] });
    expect(shown()[0].dataset.testid).toBe("year-screen-days");
  });

  it("the help is under every screen and counted; the share is the Year card alone", async () => {
    await view(threeMonths());
    expect(screen.getByTestId("year-help").dataset.counted).toBe("true");
    expect(screen.getByTestId("year-share").dataset.yearOnly).toBe("true");
    expect(screen.getByTestId("year-share").dataset.year).toBe("2026");
  });

  it("a hard year: colours, days, the kind line with its own uncounted help, the closing", async () => {
    await view(reviewOf(1));
    expect(screen.getAllByTestId(/^year-screen-/).map((el) => el.dataset.testid)).toEqual(["year-screen-colours", "year-screen-days", "year-screen-hard", "year-screen-closing"]);
    expect(screen.getByTestId("year-hard").textContent).toBe("hardLine");
    expect(screen.getByTestId("year-hard-help").dataset.counted).toBe("false");
    expect(screen.queryByTestId("year-helps")).toBeNull();
    expect(screen.queryByTestId("year-tags")).toBeNull();
  });

  it("the Plus link only for Plus, on the last screen", async () => {
    await view(reviewOf(0));
    expect(screen.queryByTestId("year-more-plus")).toBeNull();
    cleanup();
    await view(reviewOf(0), { morePlus: true });
    const link = screen.getByTestId("year-more-plus");
    expect(link.getAttribute("href")).toBe("/app/insights/review");
    expect(link.closest("[data-screen]")?.getAttribute("data-screen")).toBe("closing");
  });

  it("no share under 3 coloured months, or with share cards off", async () => {
    await view(reviewOf(3));
    expect(screen.queryByTestId("year-share")).toBeNull();
    cleanup();
    await view(threeMonths(), { share: false });
    expect(screen.queryByTestId("year-share")).toBeNull();
  });

  it("not enough days: the line with the count, and the help", async () => {
    await view(reviewOf(4));
    expect(screen.getByTestId("year-not-enough").textContent).toBe('notEnough {"count":28}');
    expect(screen.getByTestId("year-help")).toBeTruthy();
    expect(screen.queryByTestId("year-carousel")).toBeNull();
  });

  it("each month has words for screen readers", async () => {
    await view(reviewOf(0));
    const strip = screen.getByTestId("year-strip");
    expect(strip.querySelectorAll("li")).toHaveLength(12);
    expect(strip.textContent).toContain("monthMood");
    expect(strip.textContent).toContain("monthFaint");
  });
});
