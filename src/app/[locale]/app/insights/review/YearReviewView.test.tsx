import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { YearReview } from "@/lib/plus/yearReview";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children, prefetch, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { YearReviewView } = await import("./YearReviewView");
const m = messages.plus;
afterEach(cleanup);

const review: YearReview = {
  daysByMonth: [3, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  days: 9,
  moodByMonth: [4, null, 2, null, null, null, null, null, null, null, null, null],
  moodEnough: true,
  factors: { sleep: 7.5, movement: null, stress: 2 },
  entries: 12,
  moments: [{ id: "a", date: "2026-02-01", opening: "First." }],
};
const show = (r: YearReview | null, soFar = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <YearReviewView year="2026" years={["2026", "2025"]} soFar={soFar} review={r} country="NZ" backLabel="Back to Insights" dateLocaleTag="en-GB" />
    </NextIntlClientProvider>,
  );

describe("YearReviewView", () => {
  it("help first, before the title and every section", () => {
    show(review);
    const help = screen.getByTestId("review-get-help");
    for (const id of ["review-title", "review-days", "review-mood", "review-factors", "review-moments"]) {
      expect(help.compareDocumentPosition(screen.getByTestId(id)) & Node.DOCUMENT_POSITION_FOLLOWING, id).toBeTruthy();
    }
  });
  it("the year's data as it is: days, writing, the factor lines, and a factor without enough", () => {
    show(review);
    expect(screen.getByTestId("review-title")).toHaveTextContent("Your 2026");
    expect(screen.getByTestId("review-days")).toHaveTextContent("9 days with a check-in");
    expect(screen.getByTestId("review-writing")).toHaveTextContent("12 entries and 1 moment");
    expect(screen.getByTestId("review-factor-sleep")).toHaveTextContent("Sleep averaged 7.5 h a night.");
    expect(screen.getByTestId("review-factor-stress")).toHaveTextContent("Stress averaged 2.0 of 5.");
    expect(screen.getByTestId("review-factor-movement")).toHaveTextContent("Not logged often enough in 2026 to show.");
  });
  it("moments link to their entries, with the date and opening words", () => {
    show(review);
    const link = screen.getByTestId("review-moment");
    expect(link).toHaveAttribute("href", "/app/entries/a");
    expect(link).toHaveTextContent("First.");
    expect(link).toHaveTextContent("2026");
  });
  it("no scores, best or worst, streaks or AI", () => {
    show(review);
    expect(document.body.textContent).not.toMatch(/\b(best|worst|highest|lowest|streaks?|scores?|AI)\b/i);
  });
  it("the year so far; an empty year is one line", () => {
    show({ ...review, days: 0, entries: 0, moments: [] }, true);
    expect(screen.getByTestId("review-title")).toHaveTextContent("Your 2026 so far");
    expect(screen.getByTestId("review-empty")).toHaveTextContent("There are no check-ins or entries in 2026.");
    expect(screen.queryByTestId("review-days")).toBeNull();
  });
  it("a year without enough months for the mood chart: today's line", () => {
    show({ ...review, moodEnough: false });
    expect(screen.getByTestId("review-mood-not-enough")).toHaveTextContent(m.longNotEnough);
  });
});
