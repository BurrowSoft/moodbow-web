import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { CheckIn } from "@/lib/journal/checkIn";

// The check-in card with routine ticks (1.4 F), against a mocked save action: sent only when
// they changed, shown on the saved card, and never queued offline (the failed line instead).
const saveCheckIn = vi.fn();
vi.mock("./actions", () => ({ saveCheckIn: (...args: unknown[]) => saveCheckIn(...args) }));
vi.mock("@/lib/ui/withTimeout", async (orig) => ({ ...(await orig<typeof import("@/lib/ui/withTimeout")>()), SAVE_WAIT_MS: 300 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { CheckInCard } = await import("./CheckInCard");

const A = "0b6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const B = "1c7f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const ITEMS = [
  { id: A, name: "Morning meds" },
  { id: B, name: "Walk outside" },
];
const ROW: CheckIn = { local_date: "2026-10-02", mood: 4, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null, updated_at: "2026-10-02T10:00:00Z" };
const show = (routine: { items: typeof ITEMS; ticks: string[] } | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CheckInCard initial={ROW} uid="u1" date="2026-10-02" dateLocaleTag="en-US" routine={routine} />
    </NextIntlClientProvider>,
  );
const sent = (call = 0) => Object.fromEntries((saveCheckIn.mock.calls[call][1] as FormData).entries());
const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
const edit = () => fireEvent.click(screen.getByTestId("checkin-edit"));
const tick = (name: string) => fireEvent.click(screen.getAllByTestId("checkin-routine-item").find((b) => b.textContent === name)!);
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("checkin-save"));
  });
};

beforeEach(() => {
  saveCheckIn.mockReset();
  window.localStorage.clear();
  setOnline(true);
});
afterEach(cleanup);

describe("CheckInCard with routine", () => {
  it("off here or unreadable (null): no row, nothing sent", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW });
    show(null);
    edit();
    expect(screen.queryByTestId("checkin-routine")).toBeNull();
    await save();
    expect(sent()).not.toHaveProperty("routine");
  });

  it("unchanged ticks aren't sent again; the saved card lists the ticked ones", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW });
    show({ items: ITEMS, ticks: [A] });
    expect(screen.getByTestId("checkin-summary-routine")).toHaveTextContent("Morning meds");
    edit();
    await save();
    expect(sent()).not.toHaveProperty("routine");
  });

  it("a tick changed: the day's ids go with the save, and the saved card shows them", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW, routine: [A, B] });
    show({ items: ITEMS, ticks: [A] });
    edit();
    tick("Walk outside");
    await save();
    expect(JSON.parse(String(sent().routine))).toEqual([A, B]);
    expect(screen.getByTestId("checkin-summary-routine")).toHaveTextContent("Morning medsWalk outside");
    expect(screen.queryByTestId("checkin-routine-failed")).toBeNull();
  });

  it("the check-in saved but the ticks didn't: the app's line", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW, routineSaved: false });
    show({ items: ITEMS, ticks: [] });
    edit();
    tick("Morning meds");
    await save();
    expect(screen.getByTestId("checkin-routine-failed")).toHaveTextContent(messages.routine.saveFailed);
  });

  it("offline: the check-in is kept, the ticks are not, and the line says so", async () => {
    setOnline(false);
    show({ items: ITEMS, ticks: [] });
    edit();
    tick("Morning meds");
    await save();
    expect(saveCheckIn).not.toHaveBeenCalled();
    const kept = Object.entries(window.localStorage).map(([, v]) => String(v)).join("");
    expect(kept).not.toContain(A);
    expect(screen.getByTestId("checkin-routine-failed")).toHaveTextContent(messages.routine.saveFailed);
  });
});
