import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { TimelineDay } from "@/lib/journal/timeline";

// The Timeline list against a mocked loadTimeline, with a controllable
// IntersectionObserver (jsdom has none).
const loadTimeline = vi.fn();
vi.mock("./actions", () => ({ loadTimeline: (...args: unknown[]) => loadTimeline(...args) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The month header's share (decision 161) asks the month's check-ins.
const loadMonthCheckIns = vi.fn();
const loadYearCheckIns = vi.fn();
vi.mock("../insights/shareActions", () => ({ loadMonthCheckIns: (...args: unknown[]) => loadMonthCheckIns(...args), loadYearCheckIns: (...args: unknown[]) => loadYearCheckIns(...args) }));
const { TimelineList } = await import("./TimelineList");

let seeEnd: () => void = () => {};
class FakeObserver {
  constructor(private cb: IntersectionObserverCallback) {
    seeEnd = () => this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  observe() {}
  disconnect() {}
}

const CHECK_IN = { local_date: "2026-10-02", mood: 4, sleep_hours: 7.5, sleep_quality: "good" as const, exercise_minutes: 30, stress: 2, updated_at: "x" };
const ENTRY = { id: "e1", preview: "A long walk by the river.", is_moment: true, created_at: "x", updated_at: "x" };
const days: TimelineDay[] = [
  { local_date: "2026-10-02", check_in: CHECK_IN, entries: [ENTRY, { ...ENTRY, id: "e2", preview: "Later.", is_moment: false }], entry_count: 2 },
  { local_date: "2026-09-28", check_in: null, entries: [{ ...ENTRY, id: "e3", is_moment: false }], entry_count: 1 },
];
const t = messages.timeline;

const renderList = (props: Partial<React.ComponentProps<typeof TimelineList>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimelineList initial={days} initialDone={false} momentsOnly={false} dateLocaleTag="en-US" {...props} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  loadTimeline.mockReset();
  loadMonthCheckIns.mockReset().mockResolvedValue({ status: "ok", checkIns: [] });
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TimelineList", () => {
  it("days under month headers: the mood's dot, the date and its mood word, then the previews; no chips (decision 161)", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    const day = screen.getByTestId("timeline-day-2026-10-02");
    expect(day).toHaveAttribute("href", "/app/timeline/2026-10-02");
    expect(day).toHaveTextContent("Fri, Oct 2");
    expect(day).toHaveTextContent(`· ${messages.today.mood4}`);
    expect(within(day).getByTestId("timeline-mood-dot")).toBeInTheDocument();
    const row = day.closest("li")!;
    // The chips live in the day view and the entry view now.
    for (const chip of ["7.5 h", "30 min", "Stress 2 of 5"]) expect(within(row).queryByText(chip)).toBeNull();
    // Opened from the Timeline (decision 152): its nav and Back lead back here.
    expect(screen.getByTestId("timeline-entry-e1")).toHaveAttribute("href", "/app/entries/e1?from=%2Fapp%2Ftimeline");
  });

  it("a moment has the ★, named 'Moment' (UX); others don't", () => {
    renderList();
    expect(within(screen.getByTestId("timeline-entry-e1")).getByRole("img", { name: messages.entry.momentBadge })).toBeInTheDocument();
    expect(within(screen.getByTestId("timeline-entry-e2")).queryByRole("img")).toBeNull();
  });

  it("a day without a check-in: an empty dashed dot, said only to screen readers", () => {
    renderList();
    const day = screen.getByTestId("timeline-day-2026-09-28");
    expect(day).toHaveTextContent("Mon, Sep 28");
    expect(within(day).getByTestId("timeline-no-checkin-dot")).toHaveAttribute("aria-hidden", "true");
    expect(within(day).getByText(messages.timeline.dayNoCheckin)).toHaveClass("sr-only");
    expect(within(day).queryByTestId("timeline-mood-dot")).toBeNull();
  });

  it("the end in view loads the next page before the last day, skipping days already shown", async () => {
    loadTimeline.mockResolvedValue({ status: "ok", days: [days[1], { local_date: "2026-08-15", check_in: null, entries: [], entry_count: 0 }], done: true });
    renderList();
    await act(async () => seeEnd());
    await waitFor(() => expect(screen.getByTestId("timeline-day-2026-08-15")).toBeInTheDocument());
    expect(loadTimeline).toHaveBeenCalledWith("2026-09-28", false);
    expect(screen.getAllByTestId("timeline-day-2026-09-28")).toHaveLength(1);
    expect(screen.queryByTestId("timeline-more")).toBeNull();
  });

  it("Moments pages ask for moments", async () => {
    loadTimeline.mockResolvedValue({ status: "ok", days: [], done: true });
    renderList({ momentsOnly: true });
    await act(async () => seeEnd());
    expect(loadTimeline).toHaveBeenCalledWith("2026-09-28", true);
  });

  it("a failed page: the error with Try again, which loads it", async () => {
    loadTimeline.mockResolvedValueOnce({ status: "error" });
    loadTimeline.mockResolvedValueOnce({ status: "ok", days: [{ local_date: "2026-08-15", check_in: null, entries: [], entry_count: 0 }], done: true });
    renderList();
    await act(async () => seeEnd());
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.today.errGeneric);
    fireEvent.click(screen.getByTestId("timeline-retry"));
    await waitFor(() => expect(screen.getByTestId("timeline-day-2026-08-15")).toBeInTheDocument());
  });

  it("nothing yet: the empty states (All days / Moments)", () => {
    renderList({ initial: [], initialDone: true });
    expect(screen.getByTestId("timeline-empty")).toHaveTextContent(t.timelineEmptyTitle);
    expect(screen.getByTestId("timeline-empty")).toHaveTextContent(t.timelineEmptyBody);
    cleanup();
    renderList({ initial: [], initialDone: true, momentsOnly: true });
    expect(screen.getByTestId("timeline-empty")).toHaveTextContent(t.timelineMomentsEmpty);
  });
});

describe("TimelineList: more days without scrolling, and said (a11y pass)", () => {
  it("'Show more days' loads the next page; the status says how many new days came (repeats not counted)", async () => {
    loadTimeline.mockResolvedValue({ status: "ok", days: [days[1], { local_date: "2026-08-15", check_in: null, entries: [], entry_count: 0 }], done: false });
    renderList();
    const status = screen.getByTestId("timeline-loaded");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toBeEmptyDOMElement();
    fireEvent.click(screen.getByTestId("timeline-load-more"));
    await waitFor(() => expect(screen.getByTestId("timeline-day-2026-08-15")).toBeInTheDocument());
    expect(loadTimeline).toHaveBeenCalledWith("2026-09-28", false);
    expect(status).toHaveTextContent("1 more day loaded");
    expect(screen.queryByTestId("timeline-more")).not.toHaveAttribute("aria-busy");
  });
});

describe("TimelineList: Share this month (decision 161)", () => {
  const moods = (n: number) => ({ status: "ok", checkIns: Array.from({ length: n }, (_, i) => ({ local_date: `2026-10-${String(i + 1).padStart(2, "0")}`, mood: 3 })) });

  it("in each month header that has enough check-ins for a card; hidden (not disabled) otherwise", async () => {
    loadMonthCheckIns.mockImplementation(async (month: string) => (month === "2026-10" ? moods(5) : moods(4)));
    renderList({ shareable: true });
    const share = await screen.findByTestId("timeline-share-2026-10");
    expect(share).toHaveTextContent(messages.share.shareThisMonth);
    expect(loadMonthCheckIns).toHaveBeenCalledWith("2026-09");
    await act(async () => {});
    expect(screen.queryByTestId("timeline-share-2026-09")).toBeNull();
  });

  it("in Dec/Jan the month share offers the Year card too (1.1 J; UX: the app's entry points)", async () => {
    loadMonthCheckIns.mockResolvedValue(moods(5));
    const months = [1, 4, 8].flatMap((m) => Array.from({ length: 5 }, (_, i) => ({ local_date: `2026-${String(m).padStart(2, "0")}-0${i + 1}`, mood: 4 })));
    loadYearCheckIns.mockResolvedValue({ status: "ok", checkIns: months });
    renderList({ shareable: true, year: 2026 });
    fireEvent.click(await screen.findByTestId("timeline-share-2026-10"));
    expect(loadYearCheckIns).toHaveBeenCalledWith(2026);
    expect(await screen.findByTestId("share-type-year")).toHaveTextContent(messages.share.shareYear);
  });

  it("not where share cards are off", async () => {
    loadMonthCheckIns.mockResolvedValue(moods(10));
    renderList();
    await act(async () => {});
    expect(screen.queryByTestId("timeline-share-2026-10")).toBeNull();
    expect(loadMonthCheckIns).not.toHaveBeenCalled();
  });

  it("each month's count is asked once per list, however often it re-renders", async () => {
    loadMonthCheckIns.mockResolvedValue(moods(6));
    const view = renderList({ shareable: true });
    await screen.findByTestId("timeline-share-2026-10");
    // More days arrive (a re-render of the same list): no new ask.
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TimelineList initial={days} initialDone={false} momentsOnly={false} dateLocaleTag="en-US" shareable />
      </NextIntlClientProvider>,
    );
    await act(async () => {});
    expect(loadMonthCheckIns.mock.calls.filter(([m]) => m === "2026-10")).toHaveLength(1);
  });

  it("back on the Timeline (a new list), the count is asked again: a 5th check-in shows the link", async () => {
    loadMonthCheckIns.mockResolvedValue(moods(4));
    const view = renderList({ shareable: true });
    await act(async () => {});
    expect(screen.queryByTestId("timeline-share-2026-10")).toBeNull();
    view.unmount();
    loadMonthCheckIns.mockResolvedValue(moods(5));
    renderList({ shareable: true });
    expect(await screen.findByTestId("timeline-share-2026-10")).toBeInTheDocument();
  });
});

describe("Print this month (1.1 N)", () => {
  it("a link per month header to /app/print/YYYY-MM, only where printing is live", () => {
    renderList({ printable: true });
    expect(screen.getByTestId("timeline-print-2026-10")).toHaveAttribute("href", "/app/print/2026-10");
    expect(screen.getByTestId("timeline-print-2026-09")).toHaveTextContent(t.printMonth);
    cleanup();
    renderList();
    expect(screen.queryByTestId("timeline-print-2026-10")).toBeNull();
  });
});
