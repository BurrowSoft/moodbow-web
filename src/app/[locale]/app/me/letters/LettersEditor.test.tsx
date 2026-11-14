import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { dateLine } from "@/lib/journal/today";
import type { Letter } from "@/lib/journal/letters";

const save = vi.fn();
const open = vi.fn();
const remove = vi.fn();
vi.mock("./actions", () => ({
  saveLetter: (...a: unknown[]) => save(...a),
  openLetter: (...a: unknown[]) => open(...a),
  deleteLetter: (...a: unknown[]) => remove(...a),
  letterNotNow: vi.fn(),
}));
vi.mock("@/app/[locale]/app/me/safety-plan/actions", () => ({ safetyPlanHasContent: () => Promise.resolve(false) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { LettersEditor } = await import("./LettersEditor");

const m = messages.letters;
const TAG = "en-NZ";
const locked: Letter = { id: "a", body: null, writtenOn: "2026-10-09", opensOn: "2027-10-09", opened: false };
const opened: Letter = { id: "b", body: "Dear me,\nYou did it.", writtenOn: "2026-09-01", opensOn: "2026-10-01", opened: true };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const page = (initial: Letter[] = [], write: "plus" | "locked" | "none" = "plus") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LettersEditor initial={initial} dateLocaleTag={TAG} country="NZ" today="2026-11-10" write={write} offer={{ trial: true, price: "US$59.99" }} />
    </NextIntlClientProvider>,
  );

describe("LettersEditor", () => {
  it("none yet: what it's for; Dear me, and the four choices", () => {
    page();
    expect(screen.getByTestId("letters-empty")).toHaveTextContent(m.empty);
    expect(screen.getByTestId("letter-text")).toHaveAttribute("placeholder", m.placeholder);
    expect(screen.getByRole("group", { name: m.openLabel })).toBeInTheDocument();
    for (const k of ["in1", "in3", "in6", "in12"] as const) expect(screen.getByLabelText(m[k])).toBeInTheDocument();
  });

  it("Save letter with its choice, then Saved. It opens on its day", async () => {
    save.mockReturnValueOnce(Promise.resolve({ status: "ok", letters: [{ ...locked, id: "new", opensOn: "2027-05-09" }] }));
    page();
    fireEvent.change(screen.getByTestId("letter-text"), { target: { value: "Dear me, hello." } });
    fireEvent.click(screen.getByTestId("letter-months-6"));
    await act(async () => fireEvent.click(screen.getByTestId("letter-save")));
    // The default reminders don't travel (a database without 033 has no p_reminders).
    expect(save).toHaveBeenCalledWith("Dear me, hello.", 6);
    expect(screen.getByTestId("letter-saved")).toHaveTextContent(m.savedLine.replace("{date}", dateLine("2027-05-09", TAG)));
    expect(screen.getByTestId("letter-text")).toHaveValue("");
  });

  it("a locked letter: only when it opens; its text isn't in the page at all", () => {
    page([locked]);
    const item = screen.getByTestId("letter");
    expect(item).toHaveTextContent(m.timelineLine.replace("{date}", dateLine("2027-10-09", TAG)));
    expect(within(item).queryByTestId("letter-body")).toBeNull();
  });

  it("Open early asks first; Keep it for later keeps it; Open now shows its text", async () => {
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: "Dear me,\nI hope the garden grew." }));
    page([locked]);
    fireEvent.click(screen.getByTestId("letter-open"));
    expect(screen.getByTestId("letter-open-early")).toHaveTextContent(m.earlyBody.replace("{date}", dateLine("2027-10-09", TAG)));
    fireEvent.click(screen.getByTestId("letter-keep"));
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("letter-open"));
    await act(async () => fireEvent.click(screen.getByTestId("letter-open-now")));
    expect(open).toHaveBeenCalledWith("a");
    expect(screen.getByTestId("letter-body")).toHaveTextContent("I hope the garden grew.");
  });

  it("an opened letter: written on, and its text; Delete asks first", async () => {
    remove.mockReturnValueOnce(Promise.resolve({ status: "ok", letters: [] }));
    page([opened]);
    expect(screen.getByTestId("letter")).toHaveTextContent(m.cardLine.replace("{date}", dateLine("2026-09-01", TAG)));
    expect(screen.getByTestId("letter-body")).toHaveTextContent("You did it.");
    expect(screen.queryByTestId("letter-open")).toBeNull();
    fireEvent.click(screen.getByTestId("letter-delete"));
    expect(screen.getByTestId("letter-delete-confirm")).toHaveTextContent(m.deleteBody);
    await act(async () => fireEvent.click(screen.getByTestId("letter-delete-yes")));
    expect(remove).toHaveBeenCalledWith("b");
    expect(screen.queryByTestId("letter")).toBeNull();
  });

  it("there's no edit once saved", () => {
    page([locked, opened]);
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
  });

  it("words the crisis list matches: the help card opens at saving, and nothing is sent about it", async () => {
    const phrase = CRISIS_KEYWORDS?.languages.en.phrases[0] as string;
    save.mockReturnValueOnce(Promise.resolve({ status: "ok", letters: [locked] }));
    page();
    fireEvent.change(screen.getByTestId("letter-text"), { target: { value: `Dear me, ${phrase}` } });
    await act(async () => fireEvent.click(screen.getByTestId("letter-save")));
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith(`Dear me, ${phrase}`, 1);
  });
});

describe("LettersEditor: the open-early confirm only before its day (L2)", () => {
  it.each(["2026-11-10", "2026-11-01"])("opens on %s, today 2026-11-10: Open opens, no confirm", async (opensOn) => {
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: "Dear me, the garden grew." }));
    page([{ ...locked, opensOn }]);
    await act(async () => fireEvent.click(screen.getByTestId("letter-open")));
    expect(screen.queryByTestId("letter-open-early")).toBeNull();
    expect(open).toHaveBeenCalledWith("a");
    expect(screen.getByTestId("letter-body")).toHaveTextContent("the garden grew.");
  });
});

describe("LettersEditor: a letter opened from Me is matched too (the Reviewer, #267)", () => {
  it("its text matches: the help card opens, and help sits above the letter", async () => {
    const phrase = CRISIS_KEYWORDS?.languages.en.phrases[0] as string;
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: `Dear me, ${phrase}` }));
    page([locked]);
    fireEvent.click(screen.getByTestId("letter-open"));
    await act(async () => fireEvent.click(screen.getByTestId("letter-open-now")));
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    const help = screen.getByTestId("letter-open-help");
    expect(help.compareDocumentPosition(screen.getByTestId("letter-body")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an opened letter whose text matches, shown again later: help above it every time, no card popped (L1)", () => {
    const phrase = CRISIS_KEYWORDS?.languages.en.phrases[0] as string;
    page([{ ...opened, body: `Dear me, ${phrase}` }]);
    const help = screen.getByTestId("letter-open-help");
    expect(help.compareDocumentPosition(screen.getByTestId("letter-body")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("safety-card")).toBeNull();
  });

  it("no match: no card, no help added", async () => {
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: "Dear me, the garden grew." }));
    page([locked]);
    fireEvent.click(screen.getByTestId("letter-open"));
    await act(async () => fireEvent.click(screen.getByTestId("letter-open-now")));
    expect(screen.queryByTestId("safety-card")).toBeNull();
    expect(screen.queryByTestId("letter-open-help")).toBeNull();
  });
});

describe("LettersEditor: letters to future you are part of Plus (1.3 §3)", () => {
  // Audit trial: #315 retired the Plus sheet (518d664), so the locked row is a link to the Plus
  // screen; #312's own test still expects the sheet (an audit finding for its day-of merge).
  it("without Plus: no editor, a locked row that links to the Plus screen; the letters still open and delete", async () => {
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: "Dear me." }));
    page([locked, opened], "locked");
    expect(screen.queryByTestId("letter-text")).toBeNull();
    expect(screen.queryByTestId("letter-save")).toBeNull();
    expect(screen.getByTestId("letters-locked")).toHaveTextContent(m.lockedBody);
    expect(screen.getByTestId("letters-write-lock")).toHaveAttribute("href", "/app/me/plus");
    expect(screen.getAllByTestId("letter-delete")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("letter-open"));
    await act(async () => fireEvent.click(screen.getByTestId("letter-open-now")));
    expect(open).toHaveBeenCalledWith("a");
    expect(screen.getAllByTestId("letter-body")).toHaveLength(2);
  });

  it("the Plus row unreadable: neither the editor nor anything about Plus; the letters show", () => {
    page([opened], "none");
    expect(screen.queryByTestId("letter-text")).toBeNull();
    expect(screen.queryByTestId("letters-locked")).toBeNull();
    expect(document.body.textContent).not.toContain("Plus");
    expect(screen.getByTestId("letter-body")).toBeInTheDocument();
  });

  it("Plus ended while writing, its one save used: the text stays, with Copy", async () => {
    save.mockReturnValueOnce(Promise.resolve({ status: "plus_required" }));
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    page();
    fireEvent.change(screen.getByTestId("letter-text"), { target: { value: "Dear me, keep going." } });
    await act(async () => fireEvent.click(screen.getByTestId("letter-save")));
    expect(screen.getByTestId("letters-lapsed")).toHaveTextContent(m.lapsedBody);
    expect(screen.getByTestId("letter-text")).toHaveValue("Dear me, keep going.");
    expect(screen.queryByTestId("letters-failed")).toBeNull();
    await act(async () => fireEvent.click(screen.getByTestId("letter-copy")));
    expect(writeText).toHaveBeenCalledWith("Dear me, keep going.");
    expect(screen.getByTestId("letters-lapsed")).toHaveTextContent(m.copied);
  });
});

describe("LettersEditor: reminders and Open it, never squeezed (audit D)", () => {
  it("a heads-up's choice shows as wrapping text with the real select over it; the controls move as one group; radios 24 px", () => {
    page();
    fireEvent.click(screen.getByTestId("letter-months-12"));
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    const row = screen.getByTestId("letter-reminder");
    const label = within(row).getByTestId("letter-reminder-label");
    const select = within(row).getByTestId("letter-reminder-days") as HTMLSelectElement;
    const shown = label.querySelector('span[aria-hidden="true"]')!;
    expect(shown.textContent).toBe(select.selectedOptions[0].textContent);
    expect(select.className).toContain("absolute");
    expect(select.className).toContain("opacity-0");
    expect(label.className).toContain("basis-[10em]");
    // The ring shows on the label while the transparent select has keyboard focus (UX).
    expect(label.className).toContain("has-[select:focus-visible]:outline-2");
    // The time, switch and × are one group, so they wrap under the label together.
    const controls = within(row).getByTestId("letter-reminder-controls");
    expect(controls).toContainElement(within(row).getByTestId("letter-reminder-time"));
    expect(controls).toContainElement(within(row).getByTestId("letter-reminder-remove"));
    expect(screen.getByTestId("letter-reminder-day-label").className).toContain("basis-[10em]");
    // Changing the choice changes the shown text.
    fireEvent.change(select, { target: { value: select.options[0].value } });
    expect(within(screen.getByTestId("letter-reminder")).getByTestId("letter-reminder-label").querySelector('span[aria-hidden="true"]')!.textContent).toBe(select.options[0].textContent);
    for (const radio of screen.getAllByRole("radio")) expect(radio.className).toContain("h-6 w-6");
  });
});

describe("LettersEditor: reminders, like alarms (Vitor, 14 Nov; 033)", () => {
  it("on the day at 09:00 by default; heads-ups added, timed, switched off and removed; the app line", async () => {
    save.mockReturnValue(Promise.resolve({ status: "ok", letters: [] }));
    page();
    expect(screen.getByTestId("letter-reminder-day-on")).toBeChecked();
    expect(screen.getByTestId("letter-reminder-day-time")).toHaveValue("09:00");
    expect(screen.getByTestId("letter-reminders")).toHaveTextContent(m.remindersApp);
    fireEvent.click(screen.getByTestId("letter-months-12"));
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    expect(screen.getAllByTestId("letter-reminder")).toHaveLength(2);
    // Furthest first (board 26b v58): the 1 week row, then the 1 day row.
    fireEvent.change(screen.getAllByTestId("letter-reminder-time")[0], { target: { value: "20:30" } });
    fireEvent.click(screen.getAllByTestId("letter-reminder-on")[1]);
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    expect(screen.queryByTestId("letter-reminder-add")).toBeNull();
    // The newest (2 weeks) is now first: removed.
    fireEvent.click(screen.getAllByTestId("letter-reminder-remove")[0]);
    fireEvent.change(screen.getByTestId("letter-text"), { target: { value: "Dear me." } });
    await act(async () => fireEvent.click(screen.getByTestId("letter-save")));
    expect(save).toHaveBeenCalledWith("Dear me.", 12, [
      { days_before: 0, time: "09:00", on: true },
      { days_before: 1, time: "09:00", on: false },
      { days_before: 7, time: "20:30", on: true },
    ]);
  });
  it("board 26b: a heads-up's label chooses 1 day, 1 week, 2 weeks or 1 month; one that wouldn't fit, or is used, isn't offered", () => {
    page();
    // A letter opening in 1 month (2026-11-10 to 2026-12-10, 30 days): 1 month before doesn't fit.
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    // The newest row's choices: the furthest-first order puts the 1 week row first once it's added.
    const options = (i = 0) => [...screen.getAllByTestId("letter-reminder-days")[i].querySelectorAll("option")].map((o) => o.textContent);
    expect(options()).toEqual([m.remindersDay, m.remindersWeek, m.remindersTwoWeeks]);
    // Another row's choice isn't offered here.
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    expect(options()).toEqual([m.remindersWeek, m.remindersTwoWeeks]);
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    // The order on screen: furthest first, On the day last.
    expect(screen.getAllByTestId("letter-reminder-days").map((s) => (s as HTMLSelectElement).value)).toEqual(["14", "7", "1"]);
    const rows = [...screen.getByTestId("letter-reminders").querySelectorAll("[data-testid=letter-reminder], [data-testid=letter-reminder-day-time]")];
    expect(rows.at(-1)).toHaveAttribute("data-testid", "letter-reminder-day-time");
    // At 3, Add goes; the switch says its state (role="switch").
    expect(screen.queryByTestId("letter-reminder-add")).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
  });
  it("a heads-up that no longer fits a shorter Open it: said, never sent", async () => {
    page();
    fireEvent.click(screen.getByTestId("letter-months-12"));
    fireEvent.click(screen.getByTestId("letter-reminder-add"));
    // A choice (UX, board 26b): 1 month before, which fits a year away...
    fireEvent.change(screen.getByTestId("letter-reminder-days"), { target: { value: "30" } });
    // ...but not a letter opening in 1 month (30 days): still shown, and Save says why.
    fireEvent.click(screen.getByTestId("letter-months-1"));
    fireEvent.change(screen.getByTestId("letter-text"), { target: { value: "Dear me." } });
    await act(async () => fireEvent.click(screen.getByTestId("letter-save")));
    expect(screen.getByTestId("letter-reminders-invalid")).toHaveTextContent(m.remindersInvalid);
    expect(save).not.toHaveBeenCalled();
  });
});
