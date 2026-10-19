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
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TimelineList", () => {
  it("days under month headers, each with its date, mood, chips and previews", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    const day = screen.getByTestId("timeline-day-2026-10-02");
    expect(day).toHaveAttribute("href", "/app/timeline/2026-10-02");
    expect(day).toHaveTextContent("Fri, Oct 2");
    expect(day).toHaveTextContent(messages.today.mood4);
    const row = day.closest("li")!;
    for (const chip of ["7.5 h", "30 min", "Stress 2/5"]) expect(within(row).getByText(chip)).toBeInTheDocument();
    // Opened from the Timeline (decision 152): its nav and Back lead back here.
    expect(screen.getByTestId("timeline-entry-e1")).toHaveAttribute("href", "/app/entries/e1?from=%2Fapp%2Ftimeline");
  });

  it("a moment has the ★, named 'Moment' (UX); others don't", () => {
    renderList();
    expect(within(screen.getByTestId("timeline-entry-e1")).getByRole("img", { name: messages.entry.momentBadge })).toBeInTheDocument();
    expect(within(screen.getByTestId("timeline-entry-e2")).queryByRole("img")).toBeNull();
  });

  it("a day without a check-in shows no mood or chips", () => {
    renderList();
    const day = screen.getByTestId("timeline-day-2026-09-28");
    expect(day).toHaveTextContent("Mon, Sep 28");
    expect(day.closest("li")!.querySelectorAll("ul li")).toHaveLength(1);
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
