import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { localKey } from "@/lib/localData";

const signOut = vi.fn();
// The sync goes through fetch (/api/check-in-sync), never the saveCheckIn
// server action: nothing may sit in Next's action queue ahead of sign-out.
const saveCheckIn = vi.fn();
const fetchMock = vi.fn();
const answer = (status: string) => ({ ok: true, json: async () => ({ status }) });
const broadcastSignOut = vi.fn();
vi.mock("./actions", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));
vi.mock("../actions", () => ({ saveCheckIn: (...a: unknown[]) => saveCheckIn(...a) }));
vi.mock("@/lib/signOutSignal", () => ({ broadcastSignOut: (...a: unknown[]) => broadcastSignOut(...a) }));
const { SignOutButton } = await import("./SignOutButton");

const UID = "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70";
const OTHER = "9a1d4c3b-2e5f-4a6b-8c7d-1e2f3a4b5c6d";
const m = messages.me;
const DRAFT = localKey("draft-entry", UID, "new");
const PENDING = localKey("pending-checkin", UID, "2026-10-02");
const HIDDEN = localKey("on-this-day-hidden", UID, "2026-10-02");
const SEEN = localKey("milestone-seen", UID, "30");
const pendingCopy = JSON.stringify({ fields: { mood: 4, sleepHours: "", sleepQuality: "", exercise: "", stress: "" }, expected: "", date: "2026-10-02" });

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SignOutButton uid={UID} />
    </NextIntlClientProvider>,
  );
const signOutPressed = () => fireEvent.click(screen.getByTestId("me-sign-out"));
const has = (key: string) => window.localStorage.getItem(key) !== null;

// The action's success is its redirect to sign in, rethrown for Next.
const swallow = (e: Event) => e.preventDefault();
let onError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  signOut.mockReset();
  signOut.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;303;" }));
  saveCheckIn.mockReset();
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("unexpected request"));
  vi.stubGlobal("fetch", fetchMock);
  broadcastSignOut.mockReset();
  window.localStorage.clear();
  window.localStorage.setItem(HIDDEN, "1");
  window.localStorage.setItem(SEEN, "1");
  window.localStorage.setItem(localKey("draft-entry", OTHER, "new"), "theirs");
  onError = vi.spyOn(console, "error").mockImplementation(() => {});
  window.addEventListener("error", swallow);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.removeEventListener("error", swallow);
  onError.mockRestore();
});

describe("Me → Sign out (UX & PM 2026-11-03, option C)", () => {
  it("nothing unsynced: signs out at once, tells the other tabs, drops On this day's marks, keeps milestone-seen", async () => {
    renderIt();
    signOutPressed();
    await waitFor(() => expect(broadcastSignOut).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("sign-out-dialog")).toBeNull();
    expect(broadcastSignOut).toHaveBeenCalledWith({ uid: UID, mode: "keep" });
    expect(has(HIDDEN)).toBe(false);
    expect(has(SEEN)).toBe(true);
  });

  it("a check-in saved offline gets one try first: synced, nothing is left to ask about", async () => {
    window.localStorage.setItem(PENDING, pendingCopy);
    fetchMock.mockResolvedValue(answer("saved"));
    renderIt();
    signOutPressed();
    await waitFor(() => expect(broadcastSignOut).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/check-in-sync");
    expect(init.method).toBe("POST");
    expect(Object.fromEntries((init.body as FormData).entries())).toMatchObject({ local_date: "2026-10-02", mood: "4" });
    expect(saveCheckIn).not.toHaveBeenCalled();
    expect(has(PENDING)).toBe(false);
    expect(screen.queryByTestId("sign-out-dialog")).toBeNull();
  });

  it("a check-in that doesn't sync: the dialog asks, as for a draft", async () => {
    window.localStorage.setItem(PENDING, pendingCopy);
    fetchMock.mockRejectedValue(new Error("offline"));
    renderIt();
    signOutPressed();
    expect(await screen.findByTestId("sign-out-dialog")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  // Web Tester (before #100): Next runs server actions one at a time, so a
  // hung sync held "Keep it" / "Delete it" for 60 s. The request is aborted at
  // the 5 s cap and is never a server action, so sign-out goes at once.
  it("a sync that never answers: aborted at 5 s, the dialog asks, and Keep it signs out at once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.localStorage.setItem(PENDING, pendingCopy);
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    renderIt();
    signOutPressed();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("sign-out-dialog")).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(await screen.findByTestId("sign-out-dialog")).toBeInTheDocument();
    expect(signal?.aborted).toBe(true);
    fireEvent.click(screen.getByTestId("sign-out-keep"));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(saveCheckIn).not.toHaveBeenCalled();
    expect(has(PENDING)).toBe(true);
  });

  it("unsaved writing: the dialog, with Keep it as the filled default where focus starts", async () => {
    window.localStorage.setItem(DRAFT, "{}");
    renderIt();
    signOutPressed();
    const dialog = await screen.findByRole("dialog", { name: m.signOutKeepTitle });
    expect(dialog).toHaveAccessibleDescription(m.signOutKeepBody);
    expect(screen.getByTestId("sign-out-keep")).toHaveTextContent(m.signOutKeep);
    expect(screen.getByTestId("sign-out-keep")).toHaveFocus();
    expect(screen.getByTestId("sign-out-delete")).toHaveTextContent(m.signOutDelete);
    expect(signOut).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Keep it: the writing stays for next time; signs out", async () => {
    window.localStorage.setItem(DRAFT, "{}");
    window.localStorage.setItem(PENDING, "not a copy");
    renderIt();
    signOutPressed();
    fireEvent.click(await screen.findByTestId("sign-out-keep"));
    await waitFor(() => expect(broadcastSignOut).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(broadcastSignOut).toHaveBeenCalledWith({ uid: UID, mode: "keep" });
    expect(has(DRAFT)).toBe(true);
    expect(has(PENDING)).toBe(true);
    expect(has(HIDDEN)).toBe(false);
  });

  it("Delete it: this user's drafts and pending check-ins go (no one else's); signs out", async () => {
    window.localStorage.setItem(DRAFT, "{}");
    window.localStorage.setItem(PENDING, "not a copy");
    renderIt();
    signOutPressed();
    fireEvent.click(await screen.findByTestId("sign-out-delete"));
    await waitFor(() => expect(broadcastSignOut).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(broadcastSignOut).toHaveBeenCalledWith({ uid: UID, mode: "delete" });
    expect(has(DRAFT)).toBe(false);
    expect(has(PENDING)).toBe(false);
    expect(has(HIDDEN)).toBe(false);
    expect(has(SEEN)).toBe(true);
    expect(window.localStorage.getItem(localKey("draft-entry", OTHER, "new"))).toBe("theirs");
  });

  it("the sign-out itself fails (offline): nothing is wiped or broadcast, the error shows (Reviewer #147 F2)", async () => {
    signOut.mockRejectedValue(new Error("Failed to fetch"));
    window.localStorage.setItem(DRAFT, "{}");
    renderIt();
    signOutPressed();
    fireEvent.click(await screen.findByTestId("sign-out-delete"));
    expect(await screen.findByTestId("me-sign-out-error")).toHaveTextContent(messages.today.errGeneric);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(broadcastSignOut).not.toHaveBeenCalled();
    expect(has(DRAFT)).toBe(true);
    expect(has(HIDDEN)).toBe(true);
  });

  // Offline the sign-out can't reach the server (UX): the line says so, and
  // calls safe only what's actually here. Nothing is wiped or broadcast.
  describe("offline", () => {
    const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
    beforeEach(() => {
      setOnline(false);
      signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    });
    afterEach(() => {
      setOnline(true);
    });

    it("a pending check-in: the line names it, and Keep it leaves it there", async () => {
      window.localStorage.setItem(PENDING, pendingCopy);
      renderIt();
      signOutPressed();
      fireEvent.click(await screen.findByTestId("sign-out-keep"));
      expect(await screen.findByTestId("me-sign-out-error")).toHaveTextContent(m.signOutOfflineCheckIn);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(broadcastSignOut).not.toHaveBeenCalled();
      expect(has(PENDING)).toBe(true);
    });

    it("only unsaved writing: the line names that, also after Delete it (nothing was deleted)", async () => {
      window.localStorage.setItem(DRAFT, "{}");
      renderIt();
      signOutPressed();
      fireEvent.click(await screen.findByTestId("sign-out-delete"));
      expect(await screen.findByTestId("me-sign-out-error")).toHaveTextContent(m.signOutOfflineWriting);
      expect(has(DRAFT)).toBe(true);
    });

    it("nothing pending: the plain line, no promise about anything", async () => {
      renderIt();
      signOutPressed();
      expect(await screen.findByTestId("me-sign-out-error")).toHaveTextContent(m.signOutOffline);
      expect(screen.getByTestId("me-sign-out-error")).not.toHaveTextContent("safe");
    });
  });

  it("Cancel (Escape): still signed in, nothing changes, nobody is told", async () => {
    window.localStorage.setItem(DRAFT, "{}");
    renderIt();
    signOutPressed();
    await screen.findByTestId("sign-out-dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("sign-out-dialog")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    expect(broadcastSignOut).not.toHaveBeenCalled();
    expect(has(DRAFT)).toBe(true);
    expect(has(HIDDEN)).toBe(true);
  });
});
