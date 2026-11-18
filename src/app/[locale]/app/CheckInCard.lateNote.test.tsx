import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { CheckIn } from "@/lib/journal/checkIn";
import { lateNoteKey } from "@/lib/journal/lateNote";

// The late-night note on the card (1.4 D): after the person's own save between 00:00 and 04:59 in
// the profile's zone with mood 1 or 2, once a night; never for other moods, other hours, a queued
// copy syncing later, or where late-note-live is off.
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

const ZONE = "Asia/Bangkok";
// 02:00 in Bangkok on 19 Nov; 12:00 the same day.
const NIGHT = new Date("2026-11-18T19:00:00Z");
const NOON = new Date("2026-11-19T05:00:00Z");
const row = (mood: number): CheckIn => ({ local_date: "2026-11-19", mood, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null, updated_at: "2026-11-19T10:00:00Z" });
const show = (initial: CheckIn | null, on = true) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CheckInCard initial={initial} uid="u1" date="2026-11-19" dateLocaleTag="en-US" lateNote={on ? { zone: ZONE } : null} />
    </NextIntlClientProvider>,
  );
const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
const pick = (mood: number) => fireEvent.click(screen.getByTestId(`checkin-mood-${mood}`));
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("checkin-save"));
  });
};

beforeEach(() => {
  saveCheckIn.mockReset();
  window.localStorage.clear();
  setOnline(true);
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CheckInCard: the late-night note", () => {
  it("02:00 in the profile's zone, mood 2: the line and the help button, uncounted", async () => {
    vi.setSystemTime(NIGHT);
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: row(2) });
    show(null);
    pick(2);
    await save();
    const note = screen.getByTestId("checkin-late-note");
    expect(note).toHaveTextContent(messages.today.lateNote);
    expect(screen.getByTestId("late-note-get-help")).not.toHaveAttribute("data-count");
    expect(window.localStorage.getItem(lateNoteKey("u1"))).toBe("2026-11-19");
  });

  it("once a night: a second low save the same night shows nothing", async () => {
    vi.setSystemTime(NIGHT);
    window.localStorage.setItem(lateNoteKey("u1"), "2026-11-19");
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: row(1) });
    show(null);
    pick(1);
    await save();
    expect(screen.queryByTestId("checkin-late-note")).toBeNull();
  });

  it("not for mood 3, not at noon, not where it's off", async () => {
    vi.setSystemTime(NIGHT);
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: row(3) });
    show(null);
    pick(3);
    await save();
    expect(screen.queryByTestId("checkin-late-note")).toBeNull();
    cleanup();

    vi.setSystemTime(NOON);
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: row(1) });
    show(null);
    pick(1);
    await save();
    expect(screen.queryByTestId("checkin-late-note")).toBeNull();
    cleanup();

    vi.setSystemTime(NIGHT);
    show(null, false);
    pick(1);
    await save();
    expect(screen.queryByTestId("checkin-late-note")).toBeNull();
    expect(window.localStorage.getItem(lateNoteKey("u1"))).toBeNull();
  });

  it("saved offline: the person is here, so it shows", async () => {
    vi.setSystemTime(NIGHT);
    setOnline(false);
    show(null);
    pick(2);
    await save();
    expect(saveCheckIn).not.toHaveBeenCalled();
    expect(screen.getByTestId("checkin-late-note")).toBeInTheDocument();
  });
});
