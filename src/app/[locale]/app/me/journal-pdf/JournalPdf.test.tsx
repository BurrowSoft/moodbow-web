import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { PrintDay } from "@/lib/journal/printMonth";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
const { JournalPdf } = await import("./JournalPdf");
const m = messages.plus;

const day = (date: string, mood: number | null, bodies: string[] = [], moment = false): PrintDay => ({
  date,
  checkIn: mood ? { local_date: date, mood, sleep_hours: 7, exercise_minutes: null, stress: null } : null,
  entries: bodies.map((body, i) => ({ id: `${date}-${i}`, body, isMoment: moment })),
});
const show = (props: Partial<React.ComponentProps<typeof JournalPdf>>) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <JournalPdf period={null} title={null} days={[]} months={["2026-10", "2026-09"]} years={["2026"]} dateLocaleTag="en-GB" {...props} />
    </NextIntlClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JournalPdf: the picker", () => {
  it("the intro says it's made here, saved nowhere, and readable by anyone with the file; months by the browser's names", () => {
    show({});
    expect(screen.getByTestId("pdf-picker")).toHaveTextContent(m.pdfIntro);
    const select = screen.getByTestId("pdf-period");
    expect(within(select).getByRole("option", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-print")).toBeNull();
  });
  it("picking goes to that period; A year lists years", () => {
    show({});
    fireEvent.change(screen.getByTestId("pdf-period"), { target: { value: "2026-09" } });
    expect(push).toHaveBeenCalledWith("/app/me/journal-pdf?period=2026-09");
    fireEvent.click(screen.getByTestId("pdf-kind-year"));
    expect(push).toHaveBeenLastCalledWith("/app/me/journal-pdf?period=2026");
  });
  it("a period with nothing: the empty line, no button", () => {
    show({ period: { kind: "month", key: "2026-08" }, title: "August 2026" });
    expect(screen.getByTestId("pdf-empty")).toHaveTextContent("There are no check-ins or entries in August 2026.");
    expect(screen.queryByTestId("pdf-journal")).toBeNull();
  });
});

describe("JournalPdf: the journal", () => {
  it("a month: the cover with its counts, each day, the moment star, and the help line last; the button prints", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    show({ period: { kind: "month", key: "2026-10" }, title: "October 2026", days: [day("2026-10-03", 4, ["A walk."], true), day("2026-10-05", null, ["Rain.", "Tea."])] });
    const cover = screen.getByTestId("pdf-cover");
    expect(cover).toHaveTextContent(m.pdfCoverTitle);
    expect(cover).toHaveTextContent("October 2026");
    expect(screen.getByTestId("pdf-counts")).toHaveTextContent("1 day with a check-in · 3 entries");
    expect(screen.getAllByTestId("print-entry").map((e) => e.textContent)).toEqual(["A walk.", "Rain.", "Tea."]);
    // The star is an icon named "Moment" (MomentStar), not text.
    expect(within(screen.getByTestId("print-day-2026-10-03")).getByRole("img", { name: messages.entry.momentBadge })).toBeInTheDocument();
    const help = screen.getByTestId("pdf-help");
    expect(help).toHaveTextContent(m.pdfHelp);
    expect(help.compareDocumentPosition(screen.getByTestId("print-day-2026-10-05")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    fireEvent.click(screen.getByTestId("pdf-print"));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });
  it("a year: a heading per month, each after the first on a new page", () => {
    show({ period: { kind: "year", key: "2026" }, title: "2026", days: [day("2026-01-05", 3), day("2026-03-01", 4)] });
    expect(screen.getByTestId("pdf-month-2026-01")).not.toHaveClass("break-before-page");
    expect(screen.getByTestId("pdf-month-2026-03")).toHaveClass("break-before-page");
    expect(screen.getByTestId("pdf-month-2026-03")).toHaveTextContent("March 2026");
  });
  it("no AI, scores or streaks: only the person's own words and check-ins", () => {
    show({ period: { kind: "month", key: "2026-10" }, title: "October 2026", days: [day("2026-10-03", 4, ["A walk."])] });
    expect(screen.getByTestId("pdf-journal").textContent).not.toMatch(/streak|score|reflection|AI/i);
  });
});
