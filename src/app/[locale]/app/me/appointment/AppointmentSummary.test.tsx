import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { InsightRow } from "@/lib/journal/insights";
import { AppointmentSummary } from "./AppointmentSummary";

const a = messages.appointment;
const TODAY = "2026-11-09";
const row = (local_date: string, mood: number): InsightRow => ({ local_date, mood, sleep_hours: 7, stress: null, exercise_minutes: null });
const rows = [row("2026-11-09", 3), row("2026-11-08", 4), row("2026-11-07", 4), row("2026-10-01", 2)];
const long = `Walked to the river and back. ${"Then a long ordinary afternoon. ".repeat(8)}`;
const starred = [{ id: "e1", entry_date: "2026-11-08", body: `${long}\nSecond line, only in the full text.` }];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const summary = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppointmentSummary today={TODAY} rows={rows} starred={starred} dateLabels={{ "2026-11-08": "Sunday, 8 November 2026" }} />
    </NextIntlClientProvider>,
  );

describe("AppointmentSummary", () => {
  it("the last 4 weeks to start: a count of check-ins, never 'of N days'", () => {
    summary();
    expect(screen.getByTestId("appointment-range-4")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("appointment-count")).toHaveTextContent("3 check-ins");
    expect(screen.getByTestId("appointment-count").textContent).not.toMatch(/\bof\b/);
  });

  it("12 weeks takes in more; and an average with its chart where there are 3 or more", () => {
    summary();
    fireEvent.click(screen.getByTestId("appointment-range-12"));
    expect(screen.getByTestId("appointment-count")).toHaveTextContent("4 check-ins");
    expect(screen.getByTestId("appointment-average-mood")).toHaveTextContent("3.3");
    expect(screen.getByTestId("appointment-mood").querySelector("svg")).not.toBeNull();
    expect(screen.queryByTestId("appointment-stress")).toBeNull();
  });

  it("a starred entry: its date and first line; the full text only when ticked", () => {
    summary();
    const entry = screen.getByTestId("appointment-entry");
    expect(entry).toHaveTextContent("Sunday, 8 November 2026");
    const text = within(entry).getByTestId("appointment-entry-text");
    expect(text.textContent!.endsWith("…")).toBe(true);
    expect(text).not.toHaveTextContent("Second line");
    const tick = within(entry).getByLabelText(a.fullText);
    expect(tick).not.toBeChecked();
    fireEvent.click(tick);
    expect(text).toHaveTextContent("Second line, only in the full text.");
  });

  it("the box isn't saved anywhere: nothing goes to storage; it prints as typed", () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    summary();
    expect(screen.getByText(a.talkHint)).toBeInTheDocument();
    // The box by its role: the section is named by the same words (the Reviewer).
    fireEvent.change(screen.getByRole("textbox", { name: a.talk }), { target: { value: "Sleep since the move" } });
    fireEvent.click(screen.getByTestId("appointment-full"));
    expect(local).not.toHaveBeenCalled();
    expect(screen.getByTestId("appointment-talk-print")).toHaveTextContent("Sleep since the move");
  });

  it("the footer, and Print opens the browser's own print", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    summary();
    expect(screen.getByTestId("appointment-footer")).toHaveTextContent(a.footer);
    fireEvent.click(screen.getByTestId("appointment-print"));
    expect(print).toHaveBeenCalled();
  });

  it("nothing in the range: says so, with no averages", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppointmentSummary today={TODAY} rows={[]} starred={[]} dateLabels={{}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("appointment-count")).toHaveTextContent(a.empty);
    expect(screen.queryByText(a.averages)).toBeNull();
  });
});
