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

const page = (initial: Letter[] = []) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LettersEditor initial={initial} dateLocaleTag={TAG} country="NZ" />
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
