import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedWeekView, type SharedWeekStrings } from "./SharedWeekView";

// The shared-week viewer (1.4 G): nothing is fetched before "Show the week"; the token goes only in
// the POST body; the fragment is cleared; week 0 first (a view), the arrows 1-3; never text.
const strings: SharedWeekStrings = {
  titleBefore: "A week shared with you",
  introBefore: "intro",
  show: "Show the week",
  titleNamed: "{name} shared their week with you",
  titleAnon: "Someone shared their week with you",
  weekOf: "Week of {date}",
  checkIns: Array.from({ length: 8 }, (_, n) => `${n} check-ins this week`),
  routinePercent: "{name}: ticked on {percent}% of check-in days",
  routineNotEnough: "{name}: not enough days yet",
  earlier: "Earlier week",
  later: "Later week",
  none: "No check-ins yet this week.",
  unavailable: "This link isn't available.",
  loading: "Loading",
  dayNone: "{day}: no check-in",
  moods: ["Awful", "Bad", "Okay", "Good", "Great"],
};
const TOKEN = "A".repeat(43);
const week = (start: string, name: string | null = "Sam") => ({
  status: "ok",
  first_name: name,
  week_start: start,
  days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${String(Number(start.slice(8)) + i).padStart(2, "0")}`, mood: i === 0 ? 4 : null })),
  check_ins: 1,
  routine: [{ name: "Morning meds", percent: 83 }, { name: "Walk", percent: null }],
});
const fetchMock = vi.fn();
const replaceState = vi.spyOn(window.history, "replaceState");
const renderIt = () => render(<SharedWeekView strings={strings} locale="en-GB" help="help" footer="footer" />);

beforeEach(() => {
  fetchMock.mockReset();
  replaceState.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = `#${TOKEN}`;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const reply = (body: unknown) => fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body });
const sent = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string) as { token: string; week: number };

describe("SharedWeekView", () => {
  it("nothing is fetched until Show the week is tapped", () => {
    renderIt();
    expect(screen.getByTestId("shared-title").textContent).toBe("A week shared with you");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the tap: the fragment is cleared, the token goes only in the POST body, week 0 first", async () => {
    reply(week("2026-11-16"));
    renderIt();
    await act(async () => fireEvent.click(screen.getByTestId("shared-show")));
    expect(replaceState).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/share/view");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(TOKEN);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(sent(0)).toEqual({ token: TOKEN, week: 0 });
    await waitFor(() => expect(screen.getByTestId("shared-title").textContent).toBe("Sam shared their week with you"));
    expect(screen.getByTestId("shared-count").textContent).toBe("1 check-ins this week");
    expect(screen.getByTestId("shared-routine").textContent).toContain("Morning meds: ticked on 83% of check-in days");
    expect(screen.getByTestId("shared-routine").textContent).toContain("Walk: not enough days yet");
  });

  it("the arrows fetch the earlier weeks; the same week back means there's no earlier one", async () => {
    reply(week("2026-11-16"));
    renderIt();
    await act(async () => fireEvent.click(screen.getByTestId("shared-show")));
    await waitFor(() => screen.getByTestId("shared-week"));
    reply(week("2026-11-09"));
    await act(async () => fireEvent.click(screen.getByTestId("shared-earlier")));
    expect(sent(1)).toEqual({ token: TOKEN, week: 1 });
    await waitFor(() => expect(screen.getByText("Week of 9 November")).toBeTruthy());
    // Week 2 would be before the link's creation: share_view answers week 0 again.
    reply(week("2026-11-16"));
    await act(async () => fireEvent.click(screen.getByTestId("shared-earlier")));
    expect(sent(2).week).toBe(2);
    await waitFor(() => expect(screen.getByTestId("shared-earlier")).toHaveProperty("disabled", true));
    expect(screen.getByText("Week of 9 November")).toBeTruthy();
  });

  it("weeks_available 0 (a link made this week): Earlier week is off, so it never probes", async () => {
    reply({ ...week("2026-11-16"), weeks_available: 0 });
    renderIt();
    await act(async () => fireEvent.click(screen.getByTestId("shared-show")));
    await waitFor(() => screen.getByTestId("shared-week"));
    expect(screen.getByTestId("shared-earlier")).toHaveProperty("disabled", true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("unavailable, or no token at all: the one unavailable line", async () => {
    reply({ status: "unavailable" });
    renderIt();
    await act(async () => fireEvent.click(screen.getByTestId("shared-show")));
    await waitFor(() => expect(screen.getByTestId("shared-unavailable")).toBeTruthy());
    cleanup();
    window.location.hash = "";
    renderIt();
    await act(async () => fireEvent.click(screen.getByTestId("shared-show")));
    expect(screen.getByTestId("shared-unavailable")).toBeTruthy();
  });

  it("no first name: Someone; days have words for screen readers; never any text of theirs", async () => {
    reply(week("2026-11-16", null));
    renderIt();
    await act(async () => fireEvent.click(screen.getByTestId("shared-show")));
    await waitFor(() => expect(screen.getByTestId("shared-title").textContent).toBe("Someone shared their week with you"));
    const days = screen.getByTestId("shared-days").textContent ?? "";
    expect(days).toContain("Monday: Good");
    expect(days).toContain("Tuesday: no check-in");
  });
});
