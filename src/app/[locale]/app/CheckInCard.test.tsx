import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { CheckIn } from "@/lib/journal/checkIn";

// The check-in card against a mocked save action. CI has no Supabase to sign
// in to, so this is where the card's flows are covered.
const saveCheckIn = vi.fn();
vi.mock("./actions", () => ({ saveCheckIn: (...args: unknown[]) => saveCheckIn(...args) }));
const { CheckInCard } = await import("./CheckInCard");

const ROW: CheckIn = { local_date: "2026-10-02", mood: 4, sleep_hours: 7.5, sleep_quality: "good", exercise_minutes: 30, stress: 2, updated_at: "2026-10-02T10:00:00Z" };
const KEY = "mb:pending-checkin:u1";

const renderCard = (initial: CheckIn | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CheckInCard initial={initial} uid="u1" today="2026-10-02" />
    </NextIntlClientProvider>,
  );
const sent = (call = 0) => Object.fromEntries((saveCheckIn.mock.calls[call][1] as FormData).entries());
const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

beforeEach(() => {
  saveCheckIn.mockReset();
  window.localStorage.clear();
  setOnline(true);
});
afterEach(cleanup);

describe("CheckInCard", () => {
  it("mood first: Save is disabled and the optional rows hidden until a mood is picked", () => {
    renderCard(null);
    expect(screen.getByTestId("checkin-save")).toBeDisabled();
    expect(screen.queryByTestId("checkin-sleep-hours")).toBeNull();
    fireEvent.click(screen.getByTestId("checkin-mood-3"));
    expect(screen.getByTestId("checkin-mood-3")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("checkin-sleep-hours")).toBeInTheDocument();
    expect(screen.getByTestId("checkin-save")).toBeEnabled();
  });

  it("saves the whole card, then shows the summary with Edit", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW });
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-4"));
    fireEvent.change(screen.getByTestId("checkin-sleep-hours"), { target: { value: "7.5" } });
    fireEvent.click(screen.getByTestId("checkin-sleep-quality-good"));
    fireEvent.click(screen.getByTestId("checkin-exercise-30"));
    fireEvent.click(screen.getByTestId("checkin-stress-2"));
    fireEvent.click(screen.getByTestId("checkin-save"));

    await screen.findByTestId("checkin-summary");
    expect(sent()).toEqual({ local_date: "2026-10-02", mood: "4", sleep_hours: "7.5", sleep_quality: "good", exercise_minutes: "30", stress: "2", expected_updated_at: "" });
    expect(screen.getByTestId("checkin-status")).toHaveTextContent(messages.today.checkinSaved);
    expect(screen.getByTestId("checkin-summary")).toHaveTextContent(messages.today.mood4);

    fireEvent.click(screen.getByTestId("checkin-edit"));
    expect(screen.getByTestId("checkin-mood-4")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("checkin-exercise-30")).toHaveAttribute("aria-pressed", "true");
  });

  it("an edit sends the row's updated_at as the lock", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, mood: 2 } });
    renderCard(ROW);
    fireEvent.click(screen.getByTestId("checkin-edit"));
    fireEvent.click(screen.getByTestId("checkin-mood-2"));
    fireEvent.click(screen.getByTestId("checkin-save"));
    await screen.findByTestId("checkin-summary");
    expect(sent()).toMatchObject({ mood: "2", expected_updated_at: ROW.updated_at });
  });

  it("stale write: shows the error and loads the newer row", async () => {
    saveCheckIn.mockResolvedValue({ status: "error", error: "stale", checkIn: { ...ROW, mood: 5 } });
    renderCard(ROW);
    fireEvent.click(screen.getByTestId("checkin-edit"));
    fireEvent.click(screen.getByTestId("checkin-mood-1"));
    fireEvent.click(screen.getByTestId("checkin-save"));
    expect(await screen.findByTestId("checkin-error")).toHaveTextContent(messages.today.errStaleWrite);
    expect(screen.getByTestId("checkin-mood-5")).toHaveAttribute("aria-checked", "true");
  });

  it("offline: keeps a pending copy, then sends it when the browser is back online", async () => {
    setOnline(false);
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-3"));
    fireEvent.click(screen.getByTestId("checkin-save"));
    expect(screen.getByTestId("checkin-status")).toHaveTextContent(messages.today.checkinSavedOfflineWeb);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toMatchObject({ fields: { mood: 3 }, expected: "", date: "2026-10-02" });
    expect(saveCheckIn).not.toHaveBeenCalled();

    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, mood: 3 } });
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ mood: "3" });
    expect(window.localStorage.getItem(KEY)).toBeNull();
    await waitFor(() => expect(screen.getByTestId("checkin-status")).toHaveTextContent(messages.today.checkinSaved));
  });

  it("a pending copy from an earlier visit is sent on load", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ fields: { mood: 2, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-10-02" }));
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, mood: 2 } });
    renderCard(null);
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ mood: "2", local_date: "2026-10-02" });
  });

  const pendingFrom = (date: string, mood = 2) =>
    window.localStorage.setItem(KEY, JSON.stringify({ fields: { mood, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date }));

  it("yesterday's offline copy is sent for yesterday, and today's card stays as it is", async () => {
    pendingFrom("2026-10-01");
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, local_date: "2026-10-01", mood: 2 } });
    renderCard(null);
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ local_date: "2026-10-01", mood: "2" });
    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull());
    expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
    expect(screen.getByTestId("checkin-mood-2")).toHaveAttribute("aria-checked", "false");
  });

  it("a flush that fails is kept for the next try", async () => {
    pendingFrom("2026-10-02");
    saveCheckIn.mockResolvedValue({ status: "error", error: "generic" });
    renderCard(null);
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    await screen.findByTestId("checkin-error");
    expect(window.localStorage.getItem(KEY)).not.toBeNull();

    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, mood: 2 } });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBeNull());
  });

  it("a flush that redirects (consent) keeps the copy", async () => {
    pendingFrom("2026-10-02");
    saveCheckIn.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: Event) => e.preventDefault();
    window.addEventListener("error", swallow);
    try {
      renderCard(null);
      await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(window.localStorage.getItem(KEY)).not.toBeNull();
    } finally {
      window.removeEventListener("error", swallow);
      onError.mockRestore();
    }
  });

  it("a stale flush is dropped (the newer row is shown instead)", async () => {
    pendingFrom("2026-10-02");
    saveCheckIn.mockResolvedValue({ status: "error", error: "stale", checkIn: { ...ROW, mood: 5 } });
    renderCard(null);
    await screen.findByTestId("checkin-error");
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(screen.getByTestId("checkin-mood-5")).toHaveAttribute("aria-checked", "true");
  });

  it("a corrupt pending copy is ignored", () => {
    window.localStorage.setItem(KEY, "{not json");
    renderCard(null);
    expect(saveCheckIn).not.toHaveBeenCalled();
  });

  it("offline with storage unavailable: says it wasn't saved", () => {
    setOnline(false);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      renderCard(null);
      fireEvent.click(screen.getByTestId("checkin-mood-3"));
      fireEvent.click(screen.getByTestId("checkin-save"));
      expect(screen.getByTestId("checkin-error")).toHaveTextContent(messages.today.errGeneric);
      expect(screen.queryByTestId("checkin-summary")).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });

  it("the stress chip is a message, not a concatenation", async () => {
    renderCard(ROW);
    expect(screen.getByTestId("checkin-summary")).toHaveTextContent(messages.today.stressChip.replace("{level}", "2"));
  });
});
