import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("../../actions", () => ({ saveCheckIn: vi.fn() }));
// The card brings the help card (a Link) for tags the crisis list matches.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

const { DayCheckIn } = await import("./DayCheckIn");

const ROW = { local_date: "2026-09-28", mood: 2, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null, updated_at: "x" };
const renderIt = (initial: typeof ROW | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DayCheckIn initial={initial} uid="u1" date="2026-09-28" dateLocaleTag="en-US" />
    </NextIntlClientProvider>,
  );
afterEach(cleanup);

describe("DayCheckIn", () => {
  it("no check-in: says so, and Add a check-in opens the card", () => {
    renderIt(null);
    expect(screen.getByTestId("day-no-checkin")).toHaveTextContent(messages.timeline.dayNoCheckin);
    fireEvent.click(screen.getByTestId("day-add-checkin"));
    expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
  });

  it("a check-in: its summary, editable", () => {
    renderIt(ROW);
    expect(screen.getByTestId("checkin-summary")).toHaveTextContent(messages.today.mood2);
    expect(screen.getByTestId("checkin-edit")).toBeInTheDocument();
  });
});
