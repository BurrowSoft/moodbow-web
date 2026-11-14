import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { Entry } from "@/lib/journal/entry";

// Three good things (1.3): the entry editor's own save, safety check and help (Ruling 3), with
// three fields for its text. Against mocked actions, as EntryEditor.test.
const saveEntry = vi.fn();
const getEntry = vi.fn();
const push = vi.fn();
vi.mock("./actions", () => ({
  saveEntry: (...args: unknown[]) => saveEntry(...args),
  deleteEntry: vi.fn(),
  getEntry: (...args: unknown[]) => getEntry(...args),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
let keywords: { version: number; languages: Record<string, { match: "word" | "substring"; phrases: string[] }> } | null = null;
vi.mock("@/lib/safety/keywords", () => ({
  get CRISIS_KEYWORDS() {
    return keywords;
  },
}));
const { EntryEditor } = await import("./EntryEditor");

const NEW_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "mb:draft-entry:u1:new-good-things";
const WRITE_KEY = "mb:draft-entry:u1:new";
const m = messages.entry;
const saved = (body: string): Entry => ({ id: NEW_ID, entry_date: "2026-10-02", body, is_moment: false, updated_at: "2026-10-02T20:00:00Z" });
const renderGood = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntryEditor goodThings initial={null} newId={NEW_ID} uid="u1" today="2026-10-02" />
    </NextIntlClientProvider>,
  );
const field = (n: 1 | 2 | 3) => screen.getByLabelText(m[`goodThings${n}`]);
const sent = () => Object.fromEntries((saveEntry.mock.calls[0][1] as FormData).entries());

beforeEach(() => {
  saveEntry.mockReset();
  getEntry.mockReset();
  getEntry.mockResolvedValue({ status: "ok", entry: null });
  push.mockReset();
  keywords = null;
  window.localStorage.clear();
});
afterEach(cleanup);

describe("Three good things", () => {
  it("its title and three labelled fields, no big text box, date or moment switch", () => {
    renderGood();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(m.goodThingsTitle);
    for (const n of [1, 2, 3] as const) expect(field(n)).toHaveValue("");
    expect(screen.queryByTestId("entry-text")).toBeNull();
    expect(screen.queryByTestId("entry-moment")).toBeNull();
    expect(screen.getByTestId("entry-date").parentElement).toHaveClass("hidden");
  });

  it("Save waits for one line; any can be empty; one ordinary entry for today, then Today", async () => {
    saveEntry.mockResolvedValue({ status: "saved", entry: saved("Three good things\n- Tea with Ana\n- Rain stopped") });
    renderGood();
    expect(screen.getByTestId("entry-save")).toBeDisabled();
    fireEvent.change(field(3), { target: { value: "Rain stopped" } });
    fireEvent.change(field(1), { target: { value: " Tea with Ana " } });
    // The line typed into the third field stays there.
    expect(field(3)).toHaveValue("Rain stopped");
    expect(field(2)).toHaveValue("");
    fireEvent.click(screen.getByTestId("entry-save"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(saveEntry).toHaveBeenCalledTimes(1);
    expect(sent()).toEqual({ id: NEW_ID, entry_date: "2026-10-02", body: "Three good things\n- Tea with Ana\n- Rain stopped", is_moment: "false", expected_updated_at: "" });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("a flagged line: the same safety card as any entry, and it stays (Ruling 3)", async () => {
    keywords = { version: 1, languages: { en: { match: "word", phrases: ["want to die"] } } };
    saveEntry.mockResolvedValue({ status: "saved", entry: saved("Three good things\n- Some days I want to die.") });
    renderGood();
    fireEvent.change(field(1), { target: { value: "Some days I want to die." } });
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByTestId("safety-card")).toHaveTextContent(messages.safety.safetyBody);
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("safety-close"));
    await waitFor(() => expect(field(1)).toHaveFocus());
  });

  it("a failed save with a flagged line opens the card too, as any entry's", async () => {
    keywords = { version: 1, languages: { en: { match: "word", phrases: ["want to die"] } } };
    saveEntry.mockRejectedValue(new Error("offline"));
    renderGood();
    fireEvent.change(field(2), { target: { value: "I want to die" } });
    fireEvent.click(screen.getByTestId("entry-save"));
    expect(await screen.findByTestId("safety-card")).toBeInTheDocument();
  });

  it("its draft is its own: kept under its key, back in its fields, never in Write's", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ id: NEW_ID, body: "Three good things\n- a\n- b", date: "2026-10-02", isMoment: false, base: null }));
    renderGood();
    await waitFor(() => expect(field(1)).toHaveValue("a"));
    expect(field(2)).toHaveValue("b");
    expect(field(3)).toHaveValue("");
    expect(window.localStorage.getItem(WRITE_KEY)).toBeNull();
  });
});

describe("Write: the way to Three good things", () => {
  it("a new plain entry offers it when it's on, and not otherwise", () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EntryEditor initial={null} newId={NEW_ID} uid="u1" today="2026-10-02" goodThingsHref="/app/write/good-things" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("write-good-things")).toHaveAttribute("href", "/app/write/good-things");
    expect(screen.getByTestId("write-good-things")).toHaveTextContent(m.goodThingsTitle);
    unmount();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EntryEditor initial={null} newId={NEW_ID} uid="u1" today="2026-10-02" goodThingsHref={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("write-good-things")).toBeNull();
  });
});
