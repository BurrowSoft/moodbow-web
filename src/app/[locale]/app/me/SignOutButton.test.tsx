import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { localKey } from "@/lib/localData";

const signOut = vi.fn();
const saveCheckIn = vi.fn();
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

beforeEach(() => {
  signOut.mockReset();
  saveCheckIn.mockReset();
  broadcastSignOut.mockReset();
  window.localStorage.clear();
  window.localStorage.setItem(HIDDEN, "1");
  window.localStorage.setItem(SEEN, "1");
  window.localStorage.setItem(localKey("draft-entry", OTHER, "new"), "theirs");
});
afterEach(cleanup);

describe("Me → Sign out (UX & PM 2026-11-03, option C)", () => {
  it("nothing unsynced: signs out at once, tells the other tabs, drops On this day's marks, keeps milestone-seen", async () => {
    renderIt();
    signOutPressed();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("sign-out-dialog")).toBeNull();
    expect(broadcastSignOut).toHaveBeenCalledWith({ uid: UID, mode: "keep" });
    expect(has(HIDDEN)).toBe(false);
    expect(has(SEEN)).toBe(true);
  });

  it("a check-in saved offline gets one try first: synced, nothing is left to ask about", async () => {
    window.localStorage.setItem(PENDING, pendingCopy);
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: {} });
    renderIt();
    signOutPressed();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries((saveCheckIn.mock.calls[0][1] as FormData).entries())).toMatchObject({ local_date: "2026-10-02", mood: "4" });
    expect(has(PENDING)).toBe(false);
    expect(screen.queryByTestId("sign-out-dialog")).toBeNull();
  });

  it("a check-in that doesn't sync: the dialog asks, as for a draft", async () => {
    window.localStorage.setItem(PENDING, pendingCopy);
    saveCheckIn.mockRejectedValue(new Error("offline"));
    renderIt();
    signOutPressed();
    expect(await screen.findByTestId("sign-out-dialog")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
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
    expect(saveCheckIn).not.toHaveBeenCalled();
  });

  it("Keep it: the writing stays for next time; signs out", async () => {
    window.localStorage.setItem(DRAFT, "{}");
    window.localStorage.setItem(PENDING, "not a copy");
    renderIt();
    signOutPressed();
    fireEvent.click(await screen.findByTestId("sign-out-keep"));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
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
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(broadcastSignOut).toHaveBeenCalledWith({ uid: UID, mode: "delete" });
    expect(has(DRAFT)).toBe(false);
    expect(has(PENDING)).toBe(false);
    expect(has(HIDDEN)).toBe(false);
    expect(has(SEEN)).toBe(true);
    expect(window.localStorage.getItem(localKey("draft-entry", OTHER, "new"))).toBe("theirs");
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
