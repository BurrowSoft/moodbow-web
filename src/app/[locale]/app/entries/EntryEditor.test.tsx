import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { PROMPTS } from "@/lib/journal/prompts";
import type { Entry } from "@/lib/journal/entry";

// The entry editor against mocked actions (CI has no Supabase to sign in to).
const saveEntry = vi.fn();
const deleteEntry = vi.fn();
const getEntry = vi.fn();
const push = vi.fn();
vi.mock("./actions", () => ({
  saveEntry: (...args: unknown[]) => saveEntry(...args),
  deleteEntry: (...args: unknown[]) => deleteEntry(...args),
  getEntry: (...args: unknown[]) => getEntry(...args),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
// The crisis list: none by default (as until the contract is synced).
let keywords: { version: number; languages: Record<string, { match: "word" | "substring"; phrases: string[] }> } | null = null;
vi.mock("@/lib/safety/keywords", () => ({
  get CRISIS_KEYWORDS() {
    return keywords;
  },
}));
// The save's wait, shortened (30 s in the app; withTimeout.test pins it).
// held: the action's own wait never settles either, as when Next holds the
// action's result behind its open router transition (Web Tester, #122 T2b).
let held = false;
vi.mock("@/lib/ui/withTimeout", async (orig) => {
  const real = await orig<typeof import("@/lib/ui/withTimeout")>();
  return { ...real, SAVE_WAIT_MS: 300, withTimeout: <T,>(call: Promise<T>, ms: number) => (held ? call : real.withTimeout(call, ms)) };
});
const { EntryEditor } = await import("./EntryEditor");

const NEW_ID = "11111111-1111-4111-8111-111111111111";
const DRAFT_ID = "22222222-2222-4222-8222-222222222222";
const ENTRY: Entry = { id: "33333333-3333-4333-8333-333333333333", entry_date: "2026-10-01", body: "Yesterday was calm.", is_moment: false, updated_at: "2026-10-01T20:00:00Z" };
const NEW_KEY = "mb:draft-entry:u1:new";
const EDIT_KEY = `mb:draft-entry:u1:${ENTRY.id}`;
const m = messages.entry;

const renderEditor = (initial: Entry | null = null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntryEditor initial={initial} newId={initial?.id ?? NEW_ID} uid="u1" today="2026-10-02" />
    </NextIntlClientProvider>,
  );
const sent = (call = 0) => Object.fromEntries((saveEntry.mock.calls[call][1] as FormData).entries());
const type = (text: string) => fireEvent.change(screen.getByTestId("entry-text"), { target: { value: text } });
const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? "null");

beforeEach(() => {
  saveEntry.mockReset();
  deleteEntry.mockReset();
  getEntry.mockReset();
  getEntry.mockResolvedValue({ status: "ok", entry: null });
  push.mockReset();
  keywords = null;
  window.localStorage.clear();
});
afterEach(cleanup);

describe("EntryEditor: a new entry", () => {
  it("Save waits for text; a save sends the draft's id and today, then goes back to Today", async () => {
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, id: NEW_ID, entry_date: "2026-10-02", body: "Hello" } });
    renderEditor();
    expect(screen.getByTestId("entry-save")).toBeDisabled();
    expect(screen.getByLabelText(m.entryTextLabel)).toHaveAttribute("placeholder", m.entryPlaceholder);
    type("   ");
    expect(screen.getByTestId("entry-save")).toBeDisabled();
    type("Hello");
    fireEvent.click(screen.getByTestId("entry-moment"));
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(sent()).toEqual({ id: NEW_ID, entry_date: "2026-10-02", body: "Hello", is_moment: "true", expected_updated_at: "" });
    expect(window.localStorage.getItem(NEW_KEY)).toBeNull();
  });

  it("autosaves a draft a moment after typing", async () => {
    renderEditor();
    type("Draft text");
    expect(window.localStorage.getItem(NEW_KEY)).toBeNull();
    await waitFor(() => expect(stored(NEW_KEY)).toMatchObject({ id: NEW_ID, body: "Draft text", date: "2026-10-02", isMoment: false, base: null }), { timeout: 3500 });
  });

  it("an unsaved draft from an earlier visit comes back, with its own id", async () => {
    window.localStorage.setItem(NEW_KEY, JSON.stringify({ id: DRAFT_ID, body: "Kept from before", date: "2026-10-01", isMoment: true, base: null }));
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, id: DRAFT_ID } });
    renderEditor();
    expect(screen.getByTestId("entry-text")).toHaveValue("Kept from before");
    expect(screen.getByTestId("entry-date")).toHaveValue("2026-10-01");
    expect(screen.getByTestId("entry-moment")).toBeChecked();
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(saveEntry).toHaveBeenCalled());
    expect(sent()).toMatchObject({ id: DRAFT_ID, entry_date: "2026-10-01" });
  });

  it("a corrupt draft is ignored", () => {
    window.localStorage.setItem(NEW_KEY, "{oops");
    renderEditor();
    expect(screen.getByTestId("entry-text")).toHaveValue("");
  });

  it("over 20,000 characters, or a future date: the message shows and Save is off", () => {
    renderEditor();
    type("x".repeat(20001));
    expect(screen.getByTestId("entry-error")).toHaveTextContent(m.entryTooLong);
    expect(screen.getByTestId("entry-save")).toBeDisabled();
    type("ok");
    expect(screen.getByTestId("entry-date")).toHaveAttribute("max", "2026-10-02");
    fireEvent.change(screen.getByTestId("entry-date"), { target: { value: "2026-10-03" } });
    expect(screen.getByTestId("entry-error")).toHaveTextContent(messages.today.errDateInFuture);
    expect(screen.getByTestId("entry-save")).toBeDisabled();
  });

  it("a save that never answers: after the wait, the generic error, the text and its draft kept (the timeout audit)", async () => {
    saveEntry.mockReturnValue(new Promise(() => {}));
    renderEditor();
    type("Still here");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByTestId("entry-error", {}, { timeout: 2000 })).toHaveTextContent(messages.today.errGeneric);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("entry-text")).toHaveValue("Still here");
    expect(stored(NEW_KEY)).toMatchObject({ body: "Still here" });
    expect(screen.getByTestId("entry-save")).toBeEnabled();
  });

  it("…even when the action itself can't settle: the editor's own wait shows the error and Save works again (#122 T2b)", async () => {
    // Answered at the end: an action left open keeps every later transition
    // in this file from committing (React entangles them with it).
    let answer: (state: unknown) => void = () => {};
    saveEntry.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    held = true;
    try {
      renderEditor();
      type("Held");
      fireEvent.click(screen.getByTestId("entry-save"));
      expect(screen.getByTestId("entry-save")).toBeDisabled();
      expect(await screen.findByTestId("entry-error", {}, { timeout: 2000 })).toHaveTextContent(messages.today.errGeneric);
      expect(screen.getByTestId("entry-save")).toBeEnabled();
      expect(screen.getByTestId("entry-text")).toHaveValue("Held");
      expect(stored(NEW_KEY)).toMatchObject({ body: "Held" });
      expect(push).not.toHaveBeenCalled();
    } finally {
      held = false;
      await act(async () => answer({ status: "error", error: "generic" }));
    }
  });

  it("a failed request (offline): the generic error, and the draft stays", async () => {
    saveEntry.mockRejectedValue(new TypeError("Failed to fetch"));
    renderEditor();
    type("Not lost");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByTestId("entry-error")).toHaveTextContent(messages.today.errGeneric);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("entry-text")).toHaveValue("Not lost");
  });
});

describe("EntryEditor: leaving", () => {
  it("unchanged: Cancel just goes back", () => {
    renderEditor(ENTRY);
    fireEvent.click(screen.getByTestId("entry-cancel"));
    expect(push).toHaveBeenCalledWith("/app");
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
  });

  it("changed: asks; Keep draft saves it locally and leaves", () => {
    renderEditor();
    type("Half a thought");
    fireEvent.click(screen.getByTestId("entry-cancel"));
    expect(screen.getByRole("dialog", { name: m.entryLeaveTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("entry-keep-draft"));
    expect(stored(NEW_KEY)).toMatchObject({ body: "Half a thought" });
    expect(push).toHaveBeenCalledWith("/app");
  });

  it("changed: Discard drops the draft and leaves", () => {
    window.localStorage.setItem(NEW_KEY, JSON.stringify({ id: DRAFT_ID, body: "Old draft", date: "2026-10-02", isMoment: false, base: null }));
    renderEditor();
    fireEvent.click(screen.getByTestId("entry-cancel"));
    fireEvent.click(screen.getByTestId("entry-discard"));
    expect(window.localStorage.getItem(NEW_KEY)).toBeNull();
    expect(push).toHaveBeenCalledWith("/app");
  });

  it("closing the tab with changes: the browser's own prompt, and the draft is written first", () => {
    renderEditor();
    type("Before closing");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(stored(NEW_KEY)).toMatchObject({ body: "Before closing" });
  });

  it("Escape closes a dialog", () => {
    renderEditor();
    type("x");
    fireEvent.click(screen.getByTestId("entry-cancel"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
  });
});

describe("EntryEditor: editing", () => {
  it("starts from the entry, sends its updated_at as the lock", async () => {
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, body: "Edited" } });
    renderEditor(ENTRY);
    expect(screen.getByTestId("entry-text")).toHaveValue(ENTRY.body);
    type("Edited");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(sent()).toMatchObject({ id: ENTRY.id, entry_date: ENTRY.entry_date, body: "Edited", expected_updated_at: ENTRY.updated_at });
  });

  it("a draft of this entry comes back with the version it started from; another entry's doesn't", () => {
    window.localStorage.setItem(EDIT_KEY, JSON.stringify({ id: ENTRY.id, body: "Unsaved edit", date: ENTRY.entry_date, isMoment: false, base: "2026-10-01T19:00:00Z" }));
    renderEditor(ENTRY);
    expect(screen.getByTestId("entry-text")).toHaveValue("Unsaved edit");
    cleanup();
    window.localStorage.setItem(EDIT_KEY, JSON.stringify({ id: DRAFT_ID, body: "Wrong entry", date: ENTRY.entry_date, isMoment: false, base: null }));
    renderEditor(ENTRY);
    expect(screen.getByTestId("entry-text")).toHaveValue(ENTRY.body);
  });

  it("delete asks first, then deletes this entry and drops its draft", async () => {
    deleteEntry.mockResolvedValue({ status: "idle" });
    renderEditor(ENTRY);
    type("changed");
    fireEvent.click(screen.getByTestId("entry-delete"));
    const dialog = screen.getByRole("dialog", { name: m.entryDeleteTitle });
    expect(dialog).toHaveAccessibleDescription(m.entryDeleteBody);
    fireEvent.click(screen.getByTestId("entry-delete-confirm"));
    await waitFor(() => expect(deleteEntry).toHaveBeenCalled());
    expect(Object.fromEntries((deleteEntry.mock.calls[0][1] as FormData).entries())).toEqual({ id: ENTRY.id, from: "/app" });
    expect(window.localStorage.getItem(EDIT_KEY)).toBeNull();
  });

  it("a new entry has no Delete", () => {
    renderEditor();
    expect(screen.queryByTestId("entry-delete")).toBeNull();
  });
});

describe("EntryEditor: every way out asks (decision 206)", () => {
  // A link elsewhere in the page (the tab bar, the Back chevron). Its own
  // listener stands in for the router: it sees the click only when let through.
  const renderWithLink = (initial: Entry | null = null, href = "/app/timeline") => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <a href={href} data-testid="nav-link">
          {messages.app.tabTimeline}
        </a>
        <EntryEditor initial={initial} newId={initial?.id ?? NEW_ID} uid="u1" today="2026-10-02" />
      </NextIntlClientProvider>,
    );
    const reached = vi.fn((e: Event) => e.preventDefault());
    screen.getByTestId("nav-link").addEventListener("click", reached);
    return { ...view, reached };
  };

  it("a link with unsaved text is held and asks; Keep editing stays, the link never sees the click", () => {
    const { reached } = renderWithLink();
    type("Half a thought");
    fireEvent.click(screen.getByTestId("nav-link"));
    expect(screen.getByRole("dialog", { name: m.entryLeaveTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("entry-keep-editing"));
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
    expect(reached).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("Keep draft keeps it and goes on through the same link (once), not to Today", async () => {
    const { reached } = renderWithLink();
    type("Half a thought");
    fireEvent.click(screen.getByTestId("nav-link"));
    fireEvent.click(screen.getByTestId("entry-keep-draft"));
    expect(stored(NEW_KEY)).toMatchObject({ body: "Half a thought" });
    await waitFor(() => expect(reached).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("Discard drops it and goes on through the link", async () => {
    const { reached } = renderWithLink(ENTRY);
    type("changed");
    fireEvent.click(screen.getByTestId("nav-link"));
    fireEvent.click(screen.getByTestId("entry-discard"));
    expect(window.localStorage.getItem(EDIT_KEY)).toBeNull();
    await waitFor(() => expect(reached).toHaveBeenCalledTimes(1));
  });

  it("nothing to keep, a new tab (Ctrl/⌘), or another site: the link just works", () => {
    const { reached, unmount } = renderWithLink();
    fireEvent.click(screen.getByTestId("nav-link"));
    expect(reached).toHaveBeenCalledTimes(1);
    type("Some text");
    fireEvent.click(screen.getByTestId("nav-link"), { ctrlKey: true });
    fireEvent.click(screen.getByTestId("nav-link"), { metaKey: true });
    expect(reached).toHaveBeenCalledTimes(3);
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
    unmount();
    const other = renderWithLink(null, "https://example.org/");
    type("Some text");
    fireEvent.click(screen.getByTestId("nav-link"));
    expect(other.reached).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
  });

  it("a new entry with only the date or moment changed has nothing to keep: no dialog, no browser prompt", () => {
    renderEditor();
    fireEvent.change(screen.getByTestId("entry-date"), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByTestId("entry-moment"));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByTestId("entry-cancel"));
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
    expect(push).toHaveBeenCalledWith("/app");
  });

  it("an existing entry with only the moment changed asks", () => {
    renderEditor(ENTRY);
    fireEvent.click(screen.getByTestId("entry-moment"));
    fireEvent.click(screen.getByTestId("entry-cancel"));
    expect(screen.getByTestId("entry-leave-dialog")).toBeInTheDocument();
  });

  it("Keep editing is the filled default; Discard and Keep draft are outlined", () => {
    renderEditor();
    type("x");
    fireEvent.click(screen.getByTestId("entry-cancel"));
    expect(screen.getByTestId("entry-keep-editing")).toHaveClass("bg-accent");
    expect(screen.getByTestId("entry-keep-draft")).not.toHaveClass("bg-accent");
    expect(screen.getByTestId("entry-discard")).not.toHaveClass("bg-accent");
  });
});

describe("EntryEditor: ways out that aren't links ask too (the keyboard shortcuts; reviewer M1)", () => {
  it("with unsaved text, leaveThen opens the dialog; Keep editing stays, Keep draft then goes", async () => {
    const { leaveThen } = await import("@/lib/ui/leaveGuard");
    renderEditor();
    type("Half a thought");
    const go = vi.fn();
    act(() => leaveThen(go));
    expect(screen.getByRole("dialog", { name: m.entryLeaveTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("entry-keep-editing"));
    expect(go).not.toHaveBeenCalled();
    act(() => leaveThen(go));
    fireEvent.click(screen.getByTestId("entry-keep-draft"));
    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    expect(stored(NEW_KEY)).toMatchObject({ body: "Half a thought" });
    expect(push).not.toHaveBeenCalled();
  });

  it("the way out runs only once the dialog has closed: nothing inert, its focus restored, so the way out's own focus sticks (#110 P8: c + Discard)", async () => {
    const { leaveThen } = await import("@/lib/ui/leaveGuard");
    renderEditor();
    type("Half a thought");
    // The page the shortcut lands on, and what "c" focuses there.
    const target = document.createElement("button");
    document.body.appendChild(target);
    const seen: { inert: number; dialog: boolean }[] = [];
    const go = vi.fn(() => {
      seen.push({ inert: document.querySelectorAll("[inert]").length, dialog: !!screen.queryByTestId("entry-leave-dialog") });
      target.focus();
    });
    screen.getByTestId("entry-save").focus();
    act(() => leaveThen(go));
    fireEvent.click(screen.getByTestId("entry-discard"));
    // Not inside the click: the dialog is still closing then.
    expect(go).not.toHaveBeenCalled();
    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    expect(seen).toEqual([{ inert: 0, dialog: false }]);
    expect(target).toHaveFocus();
    target.remove();
  });

  it("nothing to keep: it goes at once; with the editor gone, there's no guard left", async () => {
    const { leaveThen } = await import("@/lib/ui/leaveGuard");
    const { unmount } = renderEditor();
    const go = vi.fn();
    leaveThen(go);
    expect(go).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
    type("Typed");
    unmount();
    leaveThen(go);
    expect(go).toHaveBeenCalledTimes(2);
  });
});

describe("EntryEditor: Mark as a moment is a switch (decision 206)", () => {
  it("named by its label, described by its hint, and its state is exposed", () => {
    renderEditor();
    const sw = screen.getByRole("switch", { name: m.entryMoment });
    expect(sw).toHaveAccessibleDescription(m.entryMomentHint);
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
  });
});

describe("EntryEditor: changed on another device (decision 87)", () => {
  const OTHER = { ...ENTRY, body: "Their version", updated_at: "2026-10-02T08:00:00Z" };

  it("stale, but the server's version is exactly this text, date and moment (our own late save): saved and back, no dialog (after the timeout audit)", async () => {
    const mine = { ...ENTRY, body: "My version", updated_at: "2026-10-02T08:00:00Z" };
    saveEntry.mockResolvedValue({ status: "error", error: "stale", latest: mine });
    renderEditor(ENTRY);
    type("My version");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(screen.queryByTestId("entry-conflict-dialog")).toBeNull();
    expect(window.localStorage.getItem(EDIT_KEY)).toBeNull();
  });

  it("stale with a different version (only the moment differs): the dialog as before", async () => {
    saveEntry.mockResolvedValue({ status: "error", error: "stale", latest: { ...ENTRY, body: "My version", is_moment: true, updated_at: "2026-10-02T08:00:00Z" } });
    renderEditor(ENTRY);
    type("My version");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByRole("dialog", { name: m.entryConflictTitle })).toBeInTheDocument();
  });

  it("Keep mine: saves mine again, locked to the version just seen", async () => {
    saveEntry.mockResolvedValueOnce({ status: "error", error: "stale", latest: OTHER });
    saveEntry.mockResolvedValueOnce({ status: "saved", entry: { ...OTHER, body: "My version", updated_at: "2026-10-02T09:00:00Z" } });
    renderEditor(ENTRY);
    type("My version");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByRole("dialog", { name: m.entryConflictTitle })).toHaveAccessibleDescription(m.entryConflictBody);
    fireEvent.click(screen.getByTestId("entry-conflict-keep-mine"));
    await waitFor(() => expect(saveEntry).toHaveBeenCalledTimes(2));
    expect(sent(1)).toMatchObject({ body: "My version", expected_updated_at: OTHER.updated_at });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
  });

  it("Use the other one: loads it and drops my draft", async () => {
    saveEntry.mockResolvedValue({ status: "error", error: "stale", latest: OTHER });
    renderEditor(ENTRY);
    type("My version");
    fireEvent.click(screen.getByTestId("entry-save"));
    fireEvent.click(await screen.findByTestId("entry-conflict-use-other"));
    expect(screen.getByTestId("entry-text")).toHaveValue("Their version");
    expect(window.localStorage.getItem(EDIT_KEY)).toBeNull();
    // Now unchanged: Cancel leaves without asking.
    fireEvent.click(screen.getByTestId("entry-cancel"));
    expect(push).toHaveBeenCalledWith("/app");
  });

  it("Cancel: back to my text, nothing sent", async () => {
    saveEntry.mockResolvedValue({ status: "error", error: "stale", latest: OTHER });
    renderEditor(ENTRY);
    type("My version");
    fireEvent.click(screen.getByTestId("entry-save"));
    fireEvent.click(await screen.findByTestId("entry-conflict-cancel"));
    expect(screen.getByTestId("entry-text")).toHaveValue("My version");
    expect(saveEntry).toHaveBeenCalledTimes(1);
  });

  it("deleted there: its own dialog; Keep it re-creates it with the same id", async () => {
    saveEntry.mockResolvedValueOnce({ status: "error", error: "stale", latest: null });
    saveEntry.mockResolvedValueOnce({ status: "saved", entry: ENTRY });
    renderEditor(ENTRY);
    type("Still mine");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByRole("dialog", { name: m.entryDeletedTitle })).toHaveAccessibleDescription(m.entryDeletedBody);
    expect(screen.queryByTestId("entry-conflict-cancel")).toBeNull();
    fireEvent.click(screen.getByTestId("entry-deleted-keep"));
    await waitFor(() => expect(saveEntry).toHaveBeenCalledTimes(2));
    expect(sent(1)).toMatchObject({ id: ENTRY.id, body: "Still mine", expected_updated_at: "" });
  });

  it("deleted there: Delete it drops the draft and goes back to Today", async () => {
    saveEntry.mockResolvedValue({ status: "error", error: "stale", latest: null });
    renderEditor(ENTRY);
    type("Still mine");
    await act(async () => {
      fireEvent.click(screen.getByTestId("entry-save"));
    });
    fireEvent.click(await screen.findByTestId("entry-deleted-discard"));
    expect(window.localStorage.getItem(EDIT_KEY)).toBeNull();
    expect(push).toHaveBeenCalledWith("/app");
  });
});

describe("EntryEditor: nothing typed is lost (reviewer #12)", () => {
  it("Save keeps the text as a draft before the request (a redirect unmounts the editor)", async () => {
    let answer: (value: unknown) => void = () => {};
    saveEntry.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderEditor();
    type("Pasted and saved at once");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(stored(NEW_KEY)).toMatchObject({ id: NEW_ID, body: "Pasted and saved at once" });
    // Settle it: React entangles pending actions, and an open one would hold
    // back the next tests' transitions.
    await act(async () => answer({ status: "error", error: "generic" }));
  });

  it("leaving with unsaved text by any route (unmount) keeps the draft", () => {
    const { unmount } = renderEditor();
    type("Typed, then the tab bar");
    unmount();
    expect(stored(NEW_KEY)).toMatchObject({ body: "Typed, then the tab bar" });
  });

  it("after a save, Discard or Delete nothing is written back", async () => {
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, id: NEW_ID, body: "Done" } });
    const first = renderEditor();
    type("Done");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(push).toHaveBeenCalled());
    first.unmount();
    expect(window.localStorage.getItem(NEW_KEY)).toBeNull();

    const second = renderEditor();
    type("Throw away");
    fireEvent.click(screen.getByTestId("entry-cancel"));
    fireEvent.click(screen.getByTestId("entry-discard"));
    second.unmount();
    expect(window.localStorage.getItem(NEW_KEY)).toBeNull();
  });

  it("Delete fails offline: an error, not a crash, and the edit is kept again", async () => {
    deleteEntry.mockRejectedValue(new TypeError("Failed to fetch"));
    const { unmount } = renderEditor(ENTRY);
    type("changed");
    fireEvent.click(screen.getByTestId("entry-delete"));
    fireEvent.click(screen.getByTestId("entry-delete-confirm"));
    expect(await screen.findByTestId("entry-error")).toHaveTextContent(messages.today.errGeneric);
    unmount();
    expect(stored(EDIT_KEY)).toMatchObject({ body: "changed" });
  });
});

describe("EntryEditor: a restored new draft that was already saved (reviewer #12)", () => {
  const draft = { id: DRAFT_ID, body: "Saved before", date: "2026-10-02", isMoment: false, base: null };
  const row = { id: DRAFT_ID, entry_date: "2026-10-02", body: "Saved before", is_moment: false, updated_at: "2026-10-02T07:00:00Z" };

  it("not on the server: keeps writing it", async () => {
    window.localStorage.setItem(NEW_KEY, JSON.stringify(draft));
    renderEditor();
    await waitFor(() => expect(getEntry).toHaveBeenCalledWith(DRAFT_ID));
    expect(screen.getByTestId("entry-text")).toHaveValue("Saved before");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saved with the same text: the draft is dropped and Write starts a fresh entry", async () => {
    window.localStorage.setItem(NEW_KEY, JSON.stringify(draft));
    getEntry.mockResolvedValue({ status: "ok", entry: row });
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...row, id: NEW_ID, body: "Fresh" } });
    renderEditor();
    await waitFor(() => expect(screen.getByTestId("entry-text")).toHaveValue(""));
    expect(window.localStorage.getItem(NEW_KEY)).toBeNull();
    type("Fresh");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(saveEntry).toHaveBeenCalled());
    expect(sent()).toMatchObject({ id: NEW_ID, expected_updated_at: "" });
  });

  it("saved and edited since: the decision 87 dialog, never a silent overwrite", async () => {
    window.localStorage.setItem(NEW_KEY, JSON.stringify(draft));
    getEntry.mockResolvedValue({ status: "ok", entry: { ...row, body: "Edited from Today" } });
    saveEntry.mockResolvedValue({ status: "saved", entry: row });
    renderEditor();
    expect(await screen.findByRole("dialog", { name: m.entryConflictTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("entry-conflict-keep-mine"));
    await waitFor(() => expect(saveEntry).toHaveBeenCalled());
    expect(sent()).toMatchObject({ id: DRAFT_ID, body: "Saved before", expected_updated_at: row.updated_at });
  });
});

describe("Dialog focus", () => {
  it("the leave dialog starts on Keep editing (the safe choice, decision 143), and Tab stays inside", () => {
    renderEditor();
    type("x");
    fireEvent.click(screen.getByTestId("entry-cancel"));
    const editing = screen.getByTestId("entry-keep-editing");
    const discard = screen.getByTestId("entry-discard");
    expect(editing).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(discard).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(editing).toHaveFocus();
  });

  it("Keep editing closes the dialog and stays on the text, nothing saved or discarded", () => {
    renderEditor();
    type("still writing");
    fireEvent.click(screen.getByTestId("entry-cancel"));
    fireEvent.click(screen.getByTestId("entry-keep-editing"));
    expect(screen.queryByTestId("entry-leave-dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("entry-text")).toHaveValue("still writing");
  });

  it("the delete dialog starts on Cancel; focus goes back to Delete when it closes", () => {
    renderEditor(ENTRY);
    const opener = screen.getByTestId("entry-delete");
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByTestId("entry-delete-cancel")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(opener).toHaveFocus();
  });
});

describe("EntryEditor: a new entry for an earlier day (Timeline → Add an entry)", () => {
  it("starts on that day and saves for it", async () => {
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, id: NEW_ID } });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EntryEditor initial={null} newId={NEW_ID} uid="u1" today="2026-10-02" startDate="2026-09-28" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("entry-date")).toHaveValue("2026-09-28");
    type("Remembered later");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(saveEntry).toHaveBeenCalled());
    expect(sent()).toMatchObject({ entry_date: "2026-09-28" });
  });
});

describe("EntryEditor: the safety card after a flagged save (M8, decisions 124/125)", () => {
  it("a flagged save stays on the saved entry and opens the card; closing it puts focus back in the entry", async () => {
    keywords = { version: 1, languages: { en: { match: "word", phrases: ["want to die"] } } };
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, id: NEW_ID, entry_date: "2026-10-02", body: "Some days I want to die." } });
    renderEditor();
    type("Some days I want to die.");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByTestId("safety-card")).toBeInTheDocument();
    expect(saveEntry).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    // Focus moves in the dialog's effect: wait for it (flaky under load).
    await waitFor(() => expect(screen.getByRole("heading", { name: messages.safety.safetyTitle })).toHaveFocus());
    fireEvent.click(screen.getByTestId("safety-close"));
    expect(screen.queryByTestId("safety-card")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("entry-text")).toHaveFocus());
  });

  it("after the card, saving again is an ordinary update of that version (no conflict), and a flagged text shows the card again (reviewer #35)", async () => {
    keywords = { version: 1, languages: { en: { match: "word", phrases: ["want to die"] } } };
    const first = { ...ENTRY, id: NEW_ID, entry_date: "2026-10-02", body: "I want to die.", updated_at: "2026-10-02T10:00:00Z" };
    saveEntry.mockResolvedValueOnce({ status: "saved", entry: first });
    renderEditor();
    type("I want to die.");
    fireEvent.click(screen.getByTestId("entry-save"));
    fireEvent.click(await screen.findByTestId("safety-close"));
    saveEntry.mockResolvedValueOnce({ status: "saved", entry: { ...first, body: "I want to die. Still.", updated_at: "2026-10-02T10:05:00Z" } });
    type("I want to die. Still.");
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByTestId("safety-card")).toBeInTheDocument();
    expect(sent(1)).toMatchObject({ id: NEW_ID, body: "I want to die. Still.", expected_updated_at: "2026-10-02T10:00:00Z" });
    expect(screen.queryByTestId("entry-conflict-dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("edits typed after the card are kept as a draft on leaving, based on the saved version", async () => {
    keywords = { version: 1, languages: { en: { match: "word", phrases: ["want to die"] } } };
    saveEntry.mockResolvedValueOnce({ status: "saved", entry: { ...ENTRY, id: NEW_ID, entry_date: "2026-10-02", body: "I want to die.", updated_at: "2026-10-02T10:00:00Z" } });
    const view = renderEditor();
    type("I want to die.");
    fireEvent.click(screen.getByTestId("entry-save"));
    fireEvent.click(await screen.findByTestId("safety-close"));
    type("I want to die. And more.");
    view.unmount();
    expect(stored(NEW_KEY)).toMatchObject({ id: NEW_ID, body: "I want to die. And more.", base: "2026-10-02T10:00:00Z" });
  });

  it("an ordinary save, or no list yet: no card, back to Today as before", async () => {
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, id: NEW_ID, entry_date: "2026-10-02", body: "Some days I want to die." } });
    renderEditor();
    type("Some days I want to die.");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(screen.queryByTestId("safety-card")).toBeNull();
  });
});

describe("EntryEditor for screen readers (a11y pass)", () => {
  it("a heading: New entry / Edit entry", () => {
    const view = renderEditor();
    expect(screen.getByRole("heading", { level: 1, name: m.entryNewTitle })).toBeInTheDocument();
    view.unmount();
    renderEditor(ENTRY);
    expect(screen.getByRole("heading", { level: 1, name: m.entryEditTitle })).toBeInTheDocument();
  });

  it("too long → the text is invalid and described by the message; a future date → the date is", () => {
    renderEditor();
    type("x".repeat(20_001));
    expect(screen.getByTestId("entry-text")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("entry-text")).toHaveAttribute("aria-describedby", "entry-error");
    expect(screen.getByTestId("entry-date")).not.toHaveAttribute("aria-invalid");
    type("fine");
    expect(screen.getByTestId("entry-text")).not.toHaveAttribute("aria-invalid");
    fireEvent.change(screen.getByTestId("entry-date"), { target: { value: "2026-10-09" } });
    expect(screen.getByTestId("entry-date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("entry-date")).toHaveAttribute("aria-describedby", "entry-error");
  });
});

describe("EntryEditor: leaving returns where it was opened from (decision 152)", () => {
  it("Cancel and a save go to backTo (e.g. the Timeline), not always Today", async () => {
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, id: NEW_ID, entry_date: "2026-10-02", body: "Hi" } });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EntryEditor initial={null} newId={NEW_ID} uid="u1" today="2026-10-02" backTo="/app/timeline" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("entry-cancel"));
    expect(push).toHaveBeenLastCalledWith("/app/timeline");
    type("Hi");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(push).toHaveBeenLastCalledWith("/app/timeline"));
  });
});

describe("EntryEditor: the date first (decision 161)", () => {
  it("the date field comes before the text, for the eye and for Tab", () => {
    renderEditor();
    const date = screen.getByTestId("entry-date");
    const text = screen.getByTestId("entry-text");
    expect(date.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("EntryEditor: writing prompts (1.1 I, decision 183)", () => {
  // 2026-10-20 is prompt17, then prompt18 (the contract's fixture).
  const renderWithPrompt = (promptDate: string | null) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EntryEditor initial={null} newId={NEW_ID} uid="u1" today="2026-10-20" promptDate={promptDate} />
      </NextIntlClientProvider>,
    );
  const text = (id: string) => PROMPTS.find((p) => p.id === id)!.en;

  it("an empty entry: today's prompt, read with the text field; Another shows the next", () => {
    renderWithPrompt("2026-10-20");
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(text("prompt17"));
    expect(screen.getByTestId("entry-text")).toHaveAccessibleDescription(text("prompt17"));
    fireEvent.click(screen.getByTestId("entry-prompt-another"));
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(text("prompt18"));
    expect(screen.getByTestId("entry-prompt-another")).toHaveTextContent(messages.entry.promptAnother);
  });

  it("it's only an invitation: nothing is inserted, and it goes once there's text", () => {
    renderWithPrompt("2026-10-20");
    expect(screen.getByTestId("entry-text")).toHaveValue("");
    type("Today I");
    expect(screen.queryByTestId("entry-prompt")).toBeNull();
    expect(screen.getByTestId("entry-text")).not.toHaveAttribute("aria-describedby");
    type("   ");
    expect(screen.getByTestId("entry-prompt")).toBeInTheDocument();
  });

  it("the entry moved to another day: the prompt (and its description) go; back on its day, it returns (reviewer #83)", () => {
    renderWithPrompt("2026-10-20");
    fireEvent.change(screen.getByTestId("entry-date"), { target: { value: "2026-10-15" } });
    expect(screen.queryByTestId("entry-prompt")).toBeNull();
    expect(screen.getByTestId("entry-text")).not.toHaveAttribute("aria-describedby");
    fireEvent.change(screen.getByTestId("entry-date"), { target: { value: "2026-10-20" } });
    expect(screen.getByTestId("entry-prompt")).toBeInTheDocument();
  });

  it("no promptDate (off, or a crisis-flagged day): no prompt", () => {
    renderWithPrompt(null);
    expect(screen.queryByTestId("entry-prompt")).toBeNull();
  });
});

describe("EntryEditor: a new entry's draft needs text (Web Tester #83)", () => {
  const openOn = (startDate: string) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EntryEditor initial={null} newId={NEW_ID} uid="u1" today="2026-10-02" startDate={startDate} />
      </NextIntlClientProvider>,
    );

  it("only the date (or moment) changed: nothing is kept when leaving", () => {
    const { unmount } = openOn("2026-10-02");
    fireEvent.change(screen.getByTestId("entry-date"), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByTestId("entry-moment"));
    unmount();
    expect(window.localStorage.getItem(NEW_KEY)).toBeNull();
  });

  it("an old blank draft doesn't win over the day asked for (?date=)", () => {
    window.localStorage.setItem(NEW_KEY, JSON.stringify({ id: NEW_ID, body: "  ", date: "2026-09-20", isMoment: true, base: null }));
    openOn("2026-09-28");
    expect(screen.getByTestId("entry-date")).toHaveValue("2026-09-28");
    expect(screen.getByTestId("entry-moment")).not.toBeChecked();
  });

  it("with text, the draft is kept and restored as before", () => {
    const { unmount } = openOn("2026-10-02");
    type("A few words");
    unmount();
    expect(stored(NEW_KEY)).toMatchObject({ body: "A few words" });
  });
});
