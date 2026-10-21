import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import moodFaces from "../../../../content/contracts/mood-faces.json";
import type { CheckIn } from "@/lib/journal/checkIn";

// The check-in card against a mocked save action. CI has no Supabase to sign
// in to, so this is where the card's flows are covered.
const saveCheckIn = vi.fn();
vi.mock("./actions", () => ({ saveCheckIn: (...args: unknown[]) => saveCheckIn(...args) }));
// The save's wait, shortened (30 s in the app; withTimeout.test pins it).
vi.mock("@/lib/ui/withTimeout", async (orig) => ({ ...(await orig<typeof import("@/lib/ui/withTimeout")>()), SAVE_WAIT_MS: 300 }));
const { CheckInCard } = await import("./CheckInCard");

const ROW: CheckIn = { local_date: "2026-10-02", mood: 4, sleep_hours: 7.5, sleep_quality: "good", exercise_minutes: 30, stress: 2, updated_at: "2026-10-02T10:00:00Z" };
const KEY = "mb:pending-checkin:u1";
// Per-day copies (UX): mb:pending-checkin:<uid>:<date>.
const dayKey = (date: string) => `${KEY}:${date}`;
const anyPending = () => Object.keys(window.localStorage).some((k) => k.startsWith(KEY));

const renderCard = (initial: CheckIn | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CheckInCard initial={initial} uid="u1" date="2026-10-02" dateLocaleTag="en-US" />
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
    // 7 (the start), then 7.5.
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-plus"));
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-plus"));
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
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-10-02"))!)).toMatchObject({ fields: { mood: 3 }, expected: "", date: "2026-10-02" });
    expect(saveCheckIn).not.toHaveBeenCalled();

    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, mood: 3 } });
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ mood: "3" });
    expect(anyPending()).toBe(false);
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
    window.localStorage.setItem(dayKey(date), JSON.stringify({ fields: { mood, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date }));

  it("yesterday's offline copy is sent for yesterday, and today's card stays as it is", async () => {
    pendingFrom("2026-10-01");
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, local_date: "2026-10-01", mood: 2 } });
    renderCard(null);
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    expect(sent()).toMatchObject({ local_date: "2026-10-01", mood: "2" });
    await waitFor(() => expect(anyPending()).toBe(false));
    expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
    expect(screen.getByTestId("checkin-mood-2")).toHaveAttribute("aria-checked", "false");
  });

  it("a flush that fails is kept for the next try", async () => {
    pendingFrom("2026-10-02");
    saveCheckIn.mockResolvedValue({ status: "error", error: "generic" });
    renderCard(null);
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    await screen.findByTestId("checkin-error");
    expect(anyPending()).toBe(true);

    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { ...ROW, mood: 2 } });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(anyPending()).toBe(false));
  });

  it("a flush that redirects (consent) keeps the copy", async () => {
    pendingFrom("2026-10-02");
    saveCheckIn.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/consent;307;" }));
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: Event) => e.preventDefault();
    window.addEventListener("error", swallow);
    try {
      renderCard(null);
      await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(anyPending()).toBe(true);
    } finally {
      window.removeEventListener("error", swallow);
      onError.mockRestore();
    }
  });

  const superseded = (date: string) => messages.today.offlineCheckinSuperseded.replace("{date}", date);

  it("a stale flush for today: dropped, never silently; the newer row is shown (decision 72)", async () => {
    pendingFrom("2026-10-02");
    saveCheckIn.mockResolvedValue({ status: "error", error: "stale", checkIn: { ...ROW, mood: 5 } });
    renderCard(null);
    expect(await screen.findByTestId("checkin-superseded")).toHaveTextContent(superseded("Friday, October 2, 2026"));
    expect(anyPending()).toBe(false);
    expect(screen.getByTestId("checkin-summary")).toHaveTextContent(messages.today.mood5);
    expect(screen.getByTestId("checkin-status")).toHaveTextContent(messages.today.checkinSaved);
    expect(screen.queryByTestId("checkin-error")).toBeNull();
  });

  it("a stale flush whose server row holds exactly what was sent (our own late save): saved, no notice (after the timeout audit)", async () => {
    pendingFrom("2026-10-02", 2);
    saveCheckIn.mockResolvedValue({ status: "error", error: "stale", checkIn: { ...ROW, mood: 2, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null } });
    renderCard(null);
    await waitFor(() => expect(screen.getByTestId("checkin-summary")).toHaveTextContent(messages.today.mood2));
    expect(screen.queryByTestId("checkin-superseded")).toBeNull();
    expect(anyPending()).toBe(false);
    expect(screen.getByTestId("checkin-status")).toHaveTextContent(messages.today.checkinSaved);
  });

  it("a stale flush for an earlier day: a dismissible notice naming that day; today's card unchanged", async () => {
    pendingFrom("2026-10-01");
    saveCheckIn.mockResolvedValue({ status: "error", error: "stale", checkIn: { ...ROW, local_date: "2026-10-01", mood: 5 } });
    renderCard(null);
    expect(await screen.findByTestId("checkin-superseded")).toHaveTextContent(superseded("Thursday, October 1, 2026"));
    expect(anyPending()).toBe(false);
    expect(screen.getByTestId("checkin-mood-5")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("checkin-superseded-dismiss"));
    expect(screen.queryByTestId("checkin-superseded")).toBeNull();
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

describe("CheckInCard: one offline copy per day (UX; reviewer #15)", () => {
  const renderFor = (date: string) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CheckInCard initial={null} uid="u1" date={date} dateLocaleTag="en-US" />
      </NextIntlClientProvider>,
    );
  const saveOffline = (mood: number) => {
    fireEvent.click(screen.getByTestId(`checkin-mood-${mood}`));
    fireEvent.click(screen.getByTestId("checkin-save"));
  };

  it("offline on two days keeps both; back online, both are sent (oldest first) and removed", async () => {
    setOnline(false);
    renderFor("2026-09-28");
    saveOffline(2);
    cleanup();
    renderFor("2026-10-02");
    saveOffline(4);
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-09-28"))!)).toMatchObject({ fields: { mood: 2 }, date: "2026-09-28" });
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-10-02"))!)).toMatchObject({ fields: { mood: 4 }, date: "2026-10-02" });

    saveCheckIn.mockImplementation(async (_prev: unknown, form: FormData) => ({ status: "saved", checkIn: { ...ROW, local_date: String(form.get("local_date")), mood: Number(form.get("mood")) } }));
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(2));
    expect([sent(0).local_date, sent(1).local_date]).toEqual(["2026-09-28", "2026-10-02"]);
    await waitFor(() => expect(anyPending()).toBe(false));
  });

  it("a second offline save for the same day replaces only that day's copy", () => {
    setOnline(false);
    window.localStorage.setItem(dayKey("2026-09-28"), JSON.stringify({ fields: { mood: 1, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-09-28" }));
    renderFor("2026-10-02");
    saveOffline(3);
    fireEvent.click(screen.getByTestId("checkin-edit"));
    saveOffline(5);
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-10-02"))!)).toMatchObject({ fields: { mood: 5 } });
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-09-28"))!)).toMatchObject({ fields: { mood: 1 } });
  });

  it("only the answered copy is removed; a failed one stays", async () => {
    window.localStorage.setItem(dayKey("2026-09-28"), JSON.stringify({ fields: { mood: 1, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-09-28" }));
    window.localStorage.setItem(dayKey("2026-10-01"), JSON.stringify({ fields: { mood: 2, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-10-01" }));
    saveCheckIn.mockImplementation(async (_prev: unknown, form: FormData) =>
      form.get("local_date") === "2026-09-28" ? { status: "saved", checkIn: { ...ROW, local_date: "2026-09-28" } } : { status: "error", error: "generic" },
    );
    renderFor("2026-10-02");
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(window.localStorage.getItem(dayKey("2026-09-28"))).toBeNull());
    expect(window.localStorage.getItem(dayKey("2026-10-01"))).not.toBeNull();
  });

  it("a copy the server refuses: a one-time notice naming its day, and the copy is dropped (UX parity)", async () => {
    window.localStorage.setItem(dayKey("2026-10-01"), JSON.stringify({ fields: { mood: 2, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-10-01" }));
    saveCheckIn.mockResolvedValue({ status: "error", error: "invalid" });
    renderFor("2026-10-02");
    expect(await screen.findByTestId("checkin-rejected")).toHaveTextContent(messages.today.offlineCheckinRejected.replace("{date}", "Thursday, October 1, 2026"));
    expect(anyPending()).toBe(false);
    expect(screen.queryByTestId("checkin-error")).toBeNull();
    fireEvent.click(screen.getByTestId("checkin-rejected-dismiss"));
    expect(screen.queryByTestId("checkin-rejected")).toBeNull();
  });

  it("date_in_future on sync is a rejection too", async () => {
    window.localStorage.setItem(dayKey("2026-10-03"), JSON.stringify({ fields: { mood: 2, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-10-03" }));
    saveCheckIn.mockResolvedValue({ status: "error", error: "dateInFuture" });
    renderFor("2026-10-02");
    expect(await screen.findByTestId("checkin-rejected")).toBeInTheDocument();
    expect(anyPending()).toBe(false);
  });
});

describe("CheckInCard: a request lost at the network level (Web Tester, #11)", () => {
  it("an online save that can't reach the server: kept in this browser like an offline save, no crash", async () => {
    saveCheckIn.mockRejectedValue(new TypeError("Failed to fetch"));
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-3"));
    fireEvent.click(screen.getByTestId("checkin-save"));
    expect(await screen.findByTestId("checkin-status")).toHaveTextContent(messages.today.checkinSavedOfflineWeb);
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-10-02"))!)).toMatchObject({ fields: { mood: 3 }, expected: "", date: "2026-10-02" });
  });

  it("a save that never answers: after the wait, kept like an offline save (the timeout audit)", async () => {
    saveCheckIn.mockReturnValue(new Promise(() => {}));
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-4"));
    fireEvent.click(screen.getByTestId("checkin-save"));
    expect(await screen.findByTestId("checkin-status", {}, { timeout: 2000 })).toHaveTextContent(messages.today.checkinSavedOfflineWeb);
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-10-02"))!)).toMatchObject({ fields: { mood: 4 }, date: "2026-10-02" });
  });

  it("the server gave up waiting on Supabase (unreachable): kept like an offline save, not the generic error (#122 T1a)", async () => {
    saveCheckIn.mockResolvedValue({ status: "error", error: "unreachable" });
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-5"));
    fireEvent.click(screen.getByTestId("checkin-save"));
    expect(await screen.findByTestId("checkin-status")).toHaveTextContent(messages.today.checkinSavedOfflineWeb);
    expect(screen.queryByTestId("checkin-error")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(dayKey("2026-10-02"))!)).toMatchObject({ fields: { mood: 5 }, date: "2026-10-02" });
  });

  it("…and a flush answered unreachable keeps its copy", async () => {
    window.localStorage.setItem(dayKey("2026-10-02"), JSON.stringify({ fields: { mood: 2, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-10-02" }));
    saveCheckIn.mockResolvedValue({ status: "error", error: "unreachable" });
    renderCard(null);
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(anyPending()).toBe(true);
    expect(screen.queryByTestId("checkin-error")).toBeNull();
  });

  it("…and with storage unavailable too: the generic error", async () => {
    saveCheckIn.mockRejectedValue(new TypeError("Failed to fetch"));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      renderCard(null);
      fireEvent.click(screen.getByTestId("checkin-mood-3"));
      fireEvent.click(screen.getByTestId("checkin-save"));
      expect(await screen.findByTestId("checkin-error")).toHaveTextContent(messages.today.errGeneric);
    } finally {
      setItem.mockRestore();
    }
  });

  it("a flush that can't reach the server keeps the copy and tries again on the next reconnect", async () => {
    window.localStorage.setItem(dayKey("2026-10-02"), JSON.stringify({ fields: { mood: 2, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-10-02" }));
    saveCheckIn.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    saveCheckIn.mockResolvedValueOnce({ status: "saved", checkIn: { ...ROW, mood: 2 } });
    renderCard(null);
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(anyPending()).toBe(true);
    expect(screen.queryByTestId("checkin-error")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(saveCheckIn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(anyPending()).toBe(false));
  });
});

describe("CheckInCard: a live save sent to sign-in or Consent (reviewer #11/#22)", () => {
  it("keeps the values as a pending copy before leaving (decision 81)", async () => {
    saveCheckIn.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in?signed_out=session;307;" }));
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: Event) => e.preventDefault();
    window.addEventListener("error", swallow);
    try {
      renderCard(null);
      fireEvent.click(screen.getByTestId("checkin-mood-4"));
      fireEvent.click(screen.getByTestId("checkin-stress-2"));
      fireEvent.click(screen.getByTestId("checkin-save"));
      await waitFor(() => expect(window.localStorage.getItem(dayKey("2026-10-02"))).not.toBeNull());
      expect(JSON.parse(window.localStorage.getItem(dayKey("2026-10-02"))!)).toMatchObject({ fields: { mood: 4, stress: "2" }, date: "2026-10-02" });
    } finally {
      window.removeEventListener("error", swallow);
      onError.mockRestore();
    }
  });
});

describe("CheckInCard: the mood faces (mood-faces.json; UX, superseding decision 105)", () => {
  it("each face: its Sunrise circle with the contract's eyes and mouth; all five labels shown, the chosen one in the accent", () => {
    renderCard(null);
    for (const mood of [1, 2, 3, 4, 5] as const) {
      const face = screen.getByTestId(`checkin-mood-${mood}`);
      expect(face.classList.contains("min-h-12")).toBe(true);
      expect(face).toHaveAccessibleName(messages.today[`mood${mood}`]);
      const label = screen.getByTestId(`checkin-mood-label-${mood}`);
      expect(label.classList.contains("sr-only")).toBe(false);
      expect(label.classList.contains("min-w-10")).toBe(true);
      const glyph = face.querySelector("[data-testid=mood-face] svg")!;
      expect(glyph.getAttribute("viewBox")).toBe(`0 0 ${moodFaces.view_box} ${moodFaces.view_box}`);
      expect([...glyph.querySelectorAll("circle")].map((c) => [c.getAttribute("cx"), c.getAttribute("cy"), c.getAttribute("r"), c.getAttribute("fill")])).toEqual(
        moodFaces.eyes.map((e) => [String(e.cx), String(e.cy), String(e.r), moodFaces.ink]),
      );
      const mouth = glyph.querySelector("path")!;
      expect(mouth.getAttribute("d")).toBe(moodFaces.mouths[String(mood) as "1"]);
      expect(mouth.getAttribute("stroke-width")).toBe(String(moodFaces.mouth_stroke_width));
      // glyph_scale of the circle's diameter (the outline included).
      const width = (glyph as SVGElement).style.width;
      expect(width).toContain(String(moodFaces.glyph_scale));
      expect(width).toContain("(100% + 2px)");
    }
    expect(screen.getByRole("radiogroup").classList.contains("flex-wrap")).toBe(true);
    fireEvent.click(screen.getByTestId("checkin-mood-4"));
    expect(screen.getByTestId("checkin-mood-4").classList.contains("text-accent")).toBe(true);
    expect(screen.getByTestId("checkin-mood-2").classList.contains("text-muted")).toBe(true);
    expect(screen.getByTestId("checkin-mood-4").querySelector("[data-testid=mood-face]")!.classList.contains("ring-accent")).toBe(true);
    // The ring's gap is the selected face's own background, not white (a halo in dark).
    expect(screen.getByTestId("checkin-mood-4").querySelector("[data-testid=mood-face]")!.classList.contains("ring-offset-pill")).toBe(true);
    expect(screen.queryByTestId("checkin-mood-selected")).toBeNull();
  });
});

describe("CheckInCard: stress chips at large text (reviewer #26)", () => {
  it("48 px chips in a row that wraps", () => {
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-3"));
    for (const s of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`checkin-stress-${s}`).className).toMatch(/\bmin-w-12\b/);
    expect(screen.getByTestId("checkin-stress-1").closest("div")!.parentElement!.className).toMatch(/\bflex-wrap\b/);
  });
});

describe("CheckInCard: legends without a hard-coded separator (decision 34)", () => {
  it("each optional row's legend is its title and 'Optional', two texts", () => {
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-3"));
    for (const title of [messages.today.sleepTitle, messages.today.exerciseTitle, messages.today.stressTitle]) {
      const legend = screen.getByText(title, { selector: "legend", exact: false });
      expect(legend.textContent).toBe(`${title} ${messages.today.optional}`);
    }
  });
});

describe("CheckInCard: a save is announced and focus follows (a11y pass)", () => {
  it("nothing is announced for a check-in already there; after Edit → Save, 'Saved' is, and focus moves to the summary", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW });
    renderCard(ROW);
    expect(screen.getByTestId("checkin-announce")).toHaveAttribute("role", "status");
    // The visible line isn't a second live region.
    expect(screen.getByTestId("checkin-status")).not.toHaveAttribute("role");
    fireEvent.click(screen.getByTestId("checkin-edit"));
    expect(screen.getByTestId("checkin-announce")).toBeEmptyDOMElement();
    // Focus goes to the chosen mood, not lost with the Edit button.
    // The focus moves in an effect: wait for it (flaky under load otherwise).
    await waitFor(() => expect(screen.getByTestId(`checkin-mood-${ROW.mood}`)).toHaveFocus());
    fireEvent.click(screen.getByTestId("checkin-save"));
    await screen.findByTestId("checkin-summary");
    await waitFor(() => expect(screen.getByTestId("checkin-announce")).toHaveTextContent(messages.today.checkinSaved));
    // The summary's heading: the question and its answer ("How are you today? Good").
    await waitFor(() => expect(screen.getByRole("heading", { name: `${messages.today.checkinTitle} ${messages.today[`mood${ROW.mood}` as "mood1"]}` })).toHaveFocus());
  });
});

describe("CheckInCard: the mood radios and stress buttons for screen readers (a11y pass)", () => {
  it("one group, named once, required; one tab stop; arrows move and choose (wrapping)", () => {
    renderCard(null);
    const group = screen.getByRole("radiogroup", { name: messages.today.checkinTitle });
    expect(group).toHaveAttribute("aria-required", "true");
    // The title is there once, as the group's label (no second legend name).
    expect(screen.getAllByText(messages.today.checkinTitle)).toHaveLength(1);
    expect(group).not.toHaveAttribute("aria-label");
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(radios[0].tabIndex).toBe(0);
    radios[0].focus();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByTestId("checkin-mood-2")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("checkin-mood-2")).toHaveFocus();
    expect(screen.getAllByRole("radio").filter((r) => r.tabIndex === 0)).toEqual([screen.getByTestId("checkin-mood-2")]);
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByTestId("checkin-mood-5")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("checkin-mood-5")).toHaveFocus();
  });

  it("stress buttons say what they are ('Stress 2 of 5'), with the digit still in the name", () => {
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-3"));
    expect(screen.getByRole("button", { name: "Stress 2 of 5" })).toBe(screen.getByTestId("checkin-stress-2"));
  });

  it("offline-sync notices live in one region that's always there", () => {
    renderCard(ROW);
    const region = screen.getByTestId("checkin-notices");
    expect(region).toHaveAttribute("role", "status");
  });
});

describe("CheckInCard: value colours (decision 150)", () => {
  it("only the chosen value shows its colour dot; the chips stay accent buttons; movement 0 has none", () => {
    renderCard(null);
    fireEvent.click(screen.getByTestId("checkin-mood-3"));
    expect(screen.queryByTestId("checkin-stress-dot")).toBeNull();
    fireEvent.click(screen.getByTestId("checkin-stress-2"));
    const stress = screen.getAllByTestId("checkin-stress-dot");
    expect(stress).toHaveLength(1);
    expect(screen.getByTestId("checkin-stress-2")).toContainElement(stress[0]);
    expect(stress[0]).toHaveAttribute("data-value-colour", "#F4A77A");
    expect(screen.getByTestId("checkin-stress-2").className).toContain("text-accent");
    fireEvent.click(screen.getByTestId("checkin-exercise-0"));
    expect(screen.queryByTestId("checkin-exercise-dot")).toBeNull();
    fireEvent.click(screen.getByTestId("checkin-exercise-30"));
    expect(screen.getByTestId("checkin-exercise-dot")).toHaveAttribute("data-value-colour", "#F3C24F");
    // 7, 6.5, 6, 5.5.
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByTestId("checkin-sleep-hours-minus"));
    expect(screen.getByTestId("checkin-sleep-hours")).toHaveTextContent("5.5 h");
    expect(screen.getByTestId("checkin-sleep-dot")).toHaveAttribute("data-value-colour", "#A99BD1");
  });
});

describe("CheckInCard: sleep hours as a stepper (decision 206, the app's)", () => {
  const open = (row: Parameters<typeof renderCard>[0] = null) => {
    renderCard(row);
    if (row) fireEvent.click(screen.getByTestId("checkin-edit"));
    else fireEvent.click(screen.getByTestId("checkin-mood-3"));
  };
  const value = () => screen.getByTestId("checkin-sleep-hours");

  it("empty shows a dash and no dot; the first step either way starts at 7", () => {
    open();
    expect(value()).toHaveTextContent("–");
    expect(screen.queryByTestId("checkin-sleep-dot")).toBeNull();
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-minus"));
    expect(value()).toHaveTextContent("7 h");
    expect(screen.getByTestId("checkin-sleep-dot")).toBeInTheDocument();
    cleanup();
    open();
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-plus"));
    expect(value()).toHaveTextContent("7 h");
  });

  it("half an hour a step, stopping at 0 and at 14", () => {
    open({ ...ROW, sleep_hours: 0.5 });
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-minus"));
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-minus"));
    expect(value()).toHaveTextContent("0 h");
    cleanup();
    open({ ...ROW, sleep_hours: 13.5 });
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-plus"));
    fireEvent.click(screen.getByTestId("checkin-sleep-hours-plus"));
    expect(value()).toHaveTextContent("14 h");
  });

  it("two buttons with their own names (a11y H2), and the value is spoken after each step", () => {
    open();
    expect(screen.getByRole("button", { name: messages.today.sleepLess })).toBe(screen.getByTestId("checkin-sleep-hours-minus"));
    expect(screen.getByRole("button", { name: messages.today.sleepMore })).toBe(screen.getByTestId("checkin-sleep-hours-plus"));
    expect(value()).toHaveAttribute("aria-live", "polite");
  });
});

describe("CheckInCard: the summary (decision 161)", () => {
  it("the mood's face and name with Edit beside it; the other values as chips with their colour dots", () => {
    renderCard({ ...ROW, mood: 4, sleep_hours: 7.5, sleep_quality: "good", exercise_minutes: 0, stress: 2 });
    const mood = screen.getByTestId("checkin-summary-mood");
    expect(mood.querySelector("[data-testid=mood-face]")).not.toBeNull();
    expect(mood).toHaveTextContent(messages.today.mood4);
    expect(screen.getByTestId("checkin-edit")).toBeInTheDocument();
    const chips = [...screen.getByTestId("checkin-summary-chips").querySelectorAll("li")];
    expect(chips.map((c) => c.textContent)).toEqual(["7.5 h", messages.today.sleepGood, messages.today.exerciseNone, "Stress 2 of 5"]);
    // Sleep and stress coloured; quality is words only; a rest day has no colour.
    expect(chips.map((c) => c.querySelector("[data-value-colour]")?.getAttribute("data-value-colour") ?? null)).toEqual(["#F3C24F", null, null, "#F4A77A"]);
  });
});
