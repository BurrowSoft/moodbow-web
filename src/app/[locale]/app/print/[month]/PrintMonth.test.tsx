import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { PrintDay } from "@/lib/journal/printMonth";
import { PrintMonth } from "./PrintMonth";

const t = messages.timeline;
const TITLE = "October 2026";
const DAYS: PrintDay[] = [
  { date: "2026-10-01", checkIn: { local_date: "2026-10-01", mood: 4, sleep_hours: 7.5, exercise_minutes: 0, stress: 2 }, entries: [] },
  {
    date: "2026-10-03",
    checkIn: null,
    entries: [
      { id: "a", body: "A long walk.\nThen tea.", isMoment: true },
      { id: "b", body: "Evening.", isMoment: false },
    ],
  },
];
const renderIt = (days = DAYS) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PrintMonth title={TITLE} days={days} dateLocaleTag="en-GB" />
    </NextIntlClientProvider>,
  );
const print = vi.fn();

beforeEach(() => {
  print.mockReset();
  vi.stubGlobal("print", print);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PrintMonth (1.1 N)", () => {
  it("opens the browser's print dialog once, when drawn; the button prints again", async () => {
    renderIt();
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: t.printMonth }));
    expect(print).toHaveBeenCalledTimes(2);
  });

  it("the month's title, each day with the mood word, the values in words, ★ and the full text", () => {
    renderIt();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("October 2026");
    const first = screen.getByTestId("print-day-2026-10-01");
    expect(first).toHaveTextContent(messages.today.mood4);
    expect(first.querySelector("[data-testid=print-values]")).toHaveTextContent(`7.5 h · ${messages.today.exerciseNone} · Stress 2 of 5`);
    const third = screen.getByTestId("print-day-2026-10-03");
    expect(third.querySelector("[data-testid=moment-star]")).not.toBeNull();
    expect(screen.getAllByTestId("print-entry").map((p) => p.textContent)).toEqual(["A long walk.\nThen tea.", "Evening."]);
  });

  it("the footer for every page reads Moodbow · month", () => {
    renderIt();
    expect(screen.getByTestId("print-footer")).toHaveTextContent("Moodbow · October 2026");
  });

  it("nothing this month: the empty line", () => {
    renderIt([]);
    expect(screen.getByTestId("print-empty")).toHaveTextContent(t.printEmpty);
  });
});
