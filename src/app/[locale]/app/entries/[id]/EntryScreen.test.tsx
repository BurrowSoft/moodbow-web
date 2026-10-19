import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { CheckIn } from "@/lib/journal/checkIn";
import type { Entry } from "@/lib/journal/entry";

// The entry view (decision 151) against mocked actions.
const saveEntry = vi.fn();
const deleteEntry = vi.fn();
const getEntry = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock("../actions", () => ({
  saveEntry: (...args: unknown[]) => saveEntry(...args),
  deleteEntry: (...args: unknown[]) => deleteEntry(...args),
  getEntry: (...args: unknown[]) => getEntry(...args),
}));
vi.mock("../reflectActions", () => ({ reflectOnEntry: vi.fn(), deleteReflection: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { EntryScreen } = await import("./EntryScreen");

const ENTRY: Entry = { id: "33333333-3333-4333-8333-333333333333", entry_date: "2026-10-01", body: "Calm day.\nA walk.", is_moment: false, updated_at: "2026-10-01T20:00:00Z" };
const CHECK_IN: CheckIn = { local_date: "2026-10-01", mood: 4, sleep_hours: 7.5, sleep_quality: null, exercise_minutes: 30, stress: 2, updated_at: "2026-10-01T08:00:00Z" };
const REFLECTION = { id: "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70", body: "A gentle day. What made the walk good?", tier: "full" as const, created_at: "2026-10-01T21:00:00Z" };
const BACK = "Back to Timeline";
const m = messages.entry;
const today = messages.today;

const renderIt = (over: { checkIn?: CheckIn | null; reflect?: boolean } = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntryScreen
        entry={ENTRY}
        checkIn={over.checkIn === undefined ? CHECK_IN : over.checkIn}
        from="/app/timeline"
        backLabel={BACK}
        dateLocaleTag="en-US"
        uid="u1"
        today="2026-10-02"
        reflect={over.reflect ? { initial: REFLECTION, balance: 600 } : null}
      />
    </NextIntlClientProvider>,
  );
const text = () => screen.getByTestId("entry-text") as HTMLTextAreaElement;
const sent = (call = 0) => Object.fromEntries((saveEntry.mock.calls[call][1] as FormData).entries());
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  saveEntry.mockReset();
  deleteEntry.mockReset();
  getEntry.mockReset();
  push.mockReset();
  refresh.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EntryScreen: the view", () => {
  it("top bar, date, the day's check-in, the text, Reflect, Add to this entry: in that order, also for the keyboard", () => {
    renderIt({ reflect: true });
    const back = screen.getByTestId("nav-back");
    expect(back).toHaveAttribute("aria-label", BACK);
    expect(back).toHaveAttribute("href", "/app/timeline");
    const star = screen.getByRole("button", { name: m.entryMoment });
    expect(star).toHaveAttribute("aria-pressed", "false");
    const more = screen.getByRole("button", { name: m.entryMoreActions });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Thursday, October 1, 2026");
    const strip = screen.getByTestId("entry-checkin");
    expect(strip).toHaveTextContent(today.mood4);
    expect(strip).toHaveTextContent("7.5 h");
    expect(strip).toHaveTextContent("30 min");
    expect(strip).toHaveTextContent("Stress 2/5");
    expect(screen.getByTestId("entry-body").textContent).toBe(ENTRY.body);
    const order = [back, star, more, screen.getByTestId("entry-date"), strip, screen.getByTestId("entry-body"), screen.getByTestId("reflect-panel"), screen.getByTestId("entry-add-more")];
    order.slice(1).forEach((el, i) => expect(before(order[i], el)).toBe(true));
    expect(screen.getByTestId("entry-add-more")).toHaveTextContent(m.entryAddMore);
    // Viewing isn't editing: no text area until asked.
    expect(screen.queryByTestId("entry-text")).toBeNull();
  });

  it("no check-in that day: no strip (no guilt)", () => {
    renderIt({ checkIn: null });
    expect(screen.queryByTestId("entry-checkin")).toBeNull();
  });

  it("clicking the text opens the editor with the caret where it was clicked", () => {
    renderIt();
    const body = screen.getByTestId("entry-body");
    Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: body.firstChild, offset: 4 }) });
    try {
      fireEvent.click(body);
      expect(text()).toHaveFocus();
      expect(text().value).toBe(ENTRY.body);
      expect(text().selectionStart).toBe(4);
      expect(text().selectionEnd).toBe(4);
    } finally {
      delete (document as { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
    }
  });

  it("a click where the browser can't say: the caret at the end", () => {
    renderIt();
    fireEvent.click(screen.getByTestId("entry-body"));
    expect(text().selectionStart).toBe(ENTRY.body.length);
  });

  it("a click that ends a text selection doesn't open the editor (copying still works)", () => {
    renderIt();
    vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: false } as Selection);
    fireEvent.click(screen.getByTestId("entry-body"));
    expect(screen.queryByTestId("entry-text")).toBeNull();
  });

  it("⋯ opens Edit entry and Delete; Escape closes it and focus goes back to ⋯", () => {
    renderIt();
    const more = screen.getByTestId("entry-more");
    expect(screen.getByTestId("entry-menu-edit")).not.toBeVisible();
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: m.entryEditTitle })).toBeVisible();
    fireEvent.keyDown(screen.getByTestId("entry-menu-edit"), { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
    fireEvent.click(more);
    fireEvent.click(screen.getByTestId("entry-menu-edit"));
    expect(text()).toHaveFocus();
    expect(text().selectionStart).toBe(ENTRY.body.length);
  });

  it("Cancel goes back to the view, focus on the date; Back still goes where the entry was opened from", async () => {
    renderIt();
    fireEvent.click(screen.getByTestId("entry-add-more"));
    expect(screen.getByTestId("nav-back")).toHaveAttribute("href", "/app/timeline");
    fireEvent.click(screen.getByTestId("entry-cancel"));
    await waitFor(() => expect(screen.getByTestId("entry-date")).toHaveFocus());
    expect(screen.queryByTestId("entry-text")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("Write your answer: the question quoted after the entry; Save shows the saved text in the view", async () => {
    const answered = `${ENTRY.body}\n\n“What made the walk good?”\nThe sun.`;
    saveEntry.mockResolvedValue({ status: "saved", entry: { ...ENTRY, body: answered, updated_at: "2026-10-02T09:00:00Z" } });
    renderIt({ reflect: true });
    fireEvent.click(screen.getByRole("button", { name: messages.ai.reflectAnswer }));
    expect(text().value).toBe(`${ENTRY.body}\n\n“What made the walk good?”\n`);
    expect(text()).toHaveFocus();
    expect(text().selectionStart).toBe(text().value.length);
    fireEvent.change(text(), { target: { value: answered } });
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(screen.getByTestId("entry-body").textContent).toBe(answered));
    expect(sent()).toMatchObject({ body: answered, expected_updated_at: ENTRY.updated_at });
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // The reflection is still there (the view was only hidden).
    expect(screen.getByTestId("reflect-body")).toHaveTextContent(REFLECTION.body);
  });

  it("★ saves straight away; a failed save puts it back and offers Try again (decision 111)", async () => {
    saveEntry.mockResolvedValueOnce({ status: "error", error: "generic" });
    renderIt();
    const star = screen.getByTestId("entry-moment-toggle");
    await act(async () => fireEvent.click(star));
    expect(sent()).toEqual({ id: ENTRY.id, entry_date: ENTRY.entry_date, body: ENTRY.body, is_moment: "true", expected_updated_at: ENTRY.updated_at });
    expect(star).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("entry-moment-error")).toHaveAttribute("role", "alert");
    saveEntry.mockResolvedValueOnce({ status: "saved", entry: { ...ENTRY, is_moment: true, updated_at: "2026-10-02T09:00:00Z" } });
    await act(async () => fireEvent.click(screen.getByTestId("entry-moment-retry")));
    expect(sent(1).is_moment).toBe("true");
    expect(star).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("entry-moment-error")).toBeNull();
  });

  it("⋯ → Delete asks first, then deletes this entry", async () => {
    deleteEntry.mockResolvedValue({ status: "idle" });
    renderIt();
    fireEvent.click(screen.getByTestId("entry-more"));
    fireEvent.click(screen.getByTestId("entry-menu-delete"));
    expect(screen.getByTestId("entry-delete-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("entry-delete-confirm"));
    await waitFor(() => expect(deleteEntry).toHaveBeenCalled());
    expect((deleteEntry.mock.calls[0][1] as FormData).get("id")).toBe(ENTRY.id);
    expect((deleteEntry.mock.calls[0][1] as FormData).get("from")).toBe("/app/timeline");
  });

  it("an unsaved draft of this entry in the browser: the editor opens with it straight away", () => {
    window.localStorage.setItem(`mb:draft-entry:u1:${ENTRY.id}`, JSON.stringify({ id: ENTRY.id, body: "Unsaved words", date: ENTRY.entry_date, isMoment: false, base: ENTRY.updated_at }));
    renderIt();
    expect(text().value).toBe("Unsaved words");
  });
});

describe("EntryScreen: an entry deleted on another device", () => {
  it("Delete it from the editor goes where the entry was opened from: there's nothing left to view", async () => {
    saveEntry.mockResolvedValue({ status: "error", error: "stale", latest: null });
    renderIt();
    fireEvent.click(screen.getByTestId("entry-add-more"));
    fireEvent.change(text(), { target: { value: "Still mine" } });
    await act(async () => fireEvent.click(screen.getByTestId("entry-save")));
    fireEvent.click(await screen.findByTestId("entry-deleted-discard"));
    expect(push).toHaveBeenCalledWith("/app/timeline");
  });
});

describe("EntryScreen: headings", () => {
  it("one h1 at a time: the date in the view, the editor's Edit entry while editing", () => {
    renderIt();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    fireEvent.click(screen.getByTestId("entry-add-more"));
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(m.entryEditTitle);
  });
});
