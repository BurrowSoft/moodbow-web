import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { Entry } from "@/lib/journal/entry";

// The entry editor against mocked actions (CI has no Supabase to sign in to).
const saveEntry = vi.fn();
const deleteEntry = vi.fn();
const push = vi.fn();
vi.mock("./actions", () => ({
  saveEntry: (...args: unknown[]) => saveEntry(...args),
  deleteEntry: (...args: unknown[]) => deleteEntry(...args),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
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
  push.mockReset();
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
    expect(Object.fromEntries((deleteEntry.mock.calls[0][1] as FormData).entries())).toEqual({ id: ENTRY.id });
    expect(window.localStorage.getItem(EDIT_KEY)).toBeNull();
  });

  it("a new entry has no Delete", () => {
    renderEditor();
    expect(screen.queryByTestId("entry-delete")).toBeNull();
  });
});

describe("EntryEditor: changed on another device (decision 87)", () => {
  const OTHER = { ...ENTRY, body: "Their version", updated_at: "2026-10-02T08:00:00Z" };

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
