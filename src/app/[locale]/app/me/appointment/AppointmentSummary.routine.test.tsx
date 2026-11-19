import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import type { InsightRow } from "@/lib/journal/insights";
import { AppointmentSummary } from "./AppointmentSummary";

// For my appointment's Routine section (1.4 F; appointment.json routineCases): opted-in items
// only, % of the range's check-in days ticked, "not enough days yet" under 5; none opted in or
// routine off: no section.
const TODAY = "2026-11-09";
const days = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"];
const rows: InsightRow[] = days.map((local_date) => ({ local_date, mood: 3, sleep_hours: null, stress: null, exercise_minutes: null }));
const item = (id: string, name: string, position: number, over: Partial<{ in_appointment: boolean; started_on: string; ticks: string[] }> = {}) => ({
  id,
  name,
  position,
  in_appointment: true,
  started_on: "2026-10-01",
  ticks: [] as string[],
  ...over,
});
afterEach(cleanup);
const show = (routine: ReturnType<typeof item>[] | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppointmentSummary today={TODAY} rows={rows} starred={[]} dateLabels={{}} routine={routine} />
    </NextIntlClientProvider>,
  );

describe("AppointmentSummary: Routine", () => {
  it("opted-in items in order: the share ticked, or not enough days yet", () => {
    show([
      item("b", "Walk outside", 1, { ticks: days.slice(0, 5) }),
      item("a", "Morning meds", 0, { ticks: days.slice(0, 7) }),
      item("c", "Breathing", 2, { started_on: "2026-11-07", ticks: ["2026-11-08"] }),
      item("d", "Not shared", 3, { in_appointment: false, ticks: days }),
    ]);
    expect(screen.getByTestId("appointment-routine")).toHaveTextContent(messages.routine.appointmentHeading);
    expect(screen.getAllByTestId("appointment-routine-line").map((l) => l.textContent)).toEqual([
      "Morning meds: ticked on 100% of check-in days",
      "Walk outside: ticked on 71% of check-in days",
      "Breathing: not enough days yet",
    ]);
    expect(screen.getByTestId("appointment-routine").textContent).not.toContain("Not shared");
  });

  it("the range buttons change the days counted", () => {
    show([item("a", "Morning meds", 0, { ticks: days })]);
    fireEvent.click(screen.getByTestId("appointment-range-12"));
    expect(screen.getByTestId("appointment-routine-line")).toHaveTextContent("100%");
  });

  it("none opted in, or routine off or unreadable: no section", () => {
    show([item("a", "Morning meds", 0, { in_appointment: false })]);
    expect(screen.queryByTestId("appointment-routine")).toBeNull();
    cleanup();
    show(null);
    expect(screen.queryByTestId("appointment-routine")).toBeNull();
  });
});
