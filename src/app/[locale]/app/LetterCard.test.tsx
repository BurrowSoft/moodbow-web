import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localKey } from "@/lib/localData";
import messages from "@/messages/en.json";

const open = vi.fn();
const notNow = vi.fn();
vi.mock("./me/letters/actions", () => ({ openLetter: (...a: unknown[]) => open(...a), letterNotNow: (...a: unknown[]) => notNow(...a) }));
vi.mock("@/app/[locale]/app/me/safety-plan/actions", () => ({ safetyPlanHasContent: () => Promise.resolve(false) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { LetterCard } = await import("./LetterCard");

const m = messages.letters;
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});
const TODAY = "2026-11-12";
const card = (helpFirst = false, today = TODAY, due = true) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LetterCard letter={due ? { id: "a", writtenLabel: "Friday, 9 October 2026", helpFirst } : null} uid="u1" today={today} country="NZ" />
    </NextIntlClientProvider>,
  );

describe("LetterCard", () => {
  it("on its day: when it was written, Open and Not now, and no text in the page before Open", () => {
    card();
    expect(screen.getByTestId("letter-card")).toHaveTextContent(m.cardLine.replace("{date}", "Friday, 9 October 2026"));
    expect(screen.queryByTestId("letter-card-body")).toBeNull();
    expect(document.body.textContent).not.toContain("Dear me");
  });

  it("Open fetches its text then, and shows it", async () => {
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: "Dear me,\nYou did it." }));
    card();
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-open")));
    expect(open).toHaveBeenCalledWith("a");
    expect(screen.getByTestId("letter-card-body")).toHaveTextContent("You did it.");
  });

  // UX 12 Nov (as the app's letters/app 71eef38): opened, the letter isn't due on the next load,
  // so a help-first card's help offer would go with it; the help line stays alone for the day.
  it("Open on a help-first card: the letter and the help now; after a reload the help line alone; gone the next day", async () => {
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: "Dear me,\nYou did it." }));
    card(true);
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-open")));
    expect(screen.getByTestId("letter-card-body")).toHaveTextContent("You did it.");
    expect(screen.getByTestId("letter-help")).toBeInTheDocument();
    expect(window.localStorage.getItem(localKey("letter-card-hidden", "u1", TODAY))).toBe("help");
    // The next load: the opened letter isn't due any more.
    cleanup();
    card(false, TODAY, false);
    expect(screen.getByTestId("letter-help")).toBeInTheDocument();
    expect(screen.queryByTestId("letter-card")).toBeNull();
    cleanup();
    card(false, "2026-11-13", false);
    expect(screen.queryByTestId("letter-help")).toBeNull();
  });

  it("Open without help first stores nothing: the next load is as the server says", async () => {
    open.mockReturnValueOnce(Promise.resolve({ status: "ok", body: "Dear me," }));
    card(false);
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-open")));
    expect(window.localStorage.getItem(localKey("letter-card-hidden", "u1", TODAY))).toBeNull();
    cleanup();
    card(false, TODAY, false);
    expect(document.body.textContent).toBe("");
  });

  it("a failed Open stores nothing", async () => {
    open.mockReturnValueOnce(Promise.resolve({ status: "error" }));
    card(true);
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-open")));
    expect(window.localStorage.getItem(localKey("letter-card-hidden", "u1", TODAY))).toBeNull();
  });

  it("Not now: a week on, and the card goes, with focus to Today's heading", async () => {
    notNow.mockReturnValueOnce(Promise.resolve({ status: "ok" }));
    const heading = document.createElement("h1");
    heading.id = "today-title";
    heading.tabIndex = -1;
    document.body.append(heading);
    card();
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-not-now")));
    expect(notNow).toHaveBeenCalledWith("a");
    expect(screen.queryByTestId("letter-card")).toBeNull();
    expect(heading).toHaveFocus();
    heading.remove();
  });

  // UX 12 Nov (as the app): Not now means no letter card again today on this device, even after a
  // reload, so letters don't come one after another; tomorrow, or for someone else, it's back.
  it("after Not now, no letter card for the rest of today here, reload or not; tomorrow it's back", async () => {
    notNow.mockReturnValueOnce(Promise.resolve({ status: "ok" }));
    card();
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-not-now")));
    expect(window.localStorage.getItem(localKey("letter-card-hidden", "u1", TODAY))).toBe("1");
    cleanup();
    card();
    expect(screen.queryByTestId("letter-card")).toBeNull();
    cleanup();
    card(false, "2026-11-13");
    expect(screen.getByTestId("letter-card")).toBeInTheDocument();
  });

  // UX 12 Nov (the Reviewer's finding: Today has no standing Get help now): a help-first card's
  // Not now leaves the help offer alone on Today for the rest of the day, reload or not, even
  // when no letter is left to offer.
  it("Not now on a help-first card: only the help line stays, reload or not, letter or none", async () => {
    notNow.mockReturnValueOnce(Promise.resolve({ status: "ok" }));
    card(true);
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-not-now")));
    expect(screen.queryByTestId("letter-card")).toBeNull();
    expect(screen.getByTestId("letter-help")).toBeInTheDocument();
    expect(window.localStorage.getItem(localKey("letter-card-hidden", "u1", TODAY))).toBe("help");
    cleanup();
    card(false, TODAY, false);
    expect(screen.getByTestId("letter-help")).toBeInTheDocument();
    expect(screen.queryByTestId("letter-card")).toBeNull();
    cleanup();
    card(false, "2026-11-13", false);
    expect(screen.queryByTestId("letter-help")).toBeNull();
  });

  it("hidden without help first: nothing at all, letter or none", () => {
    window.localStorage.setItem(localKey("letter-card-hidden", "u1", TODAY), "1");
    card(false);
    expect(screen.queryByTestId("letter-card")).toBeNull();
    expect(screen.queryByTestId("letter-help")).toBeNull();
    cleanup();
    card(false, TODAY, false);
    expect(document.body.textContent).toBe("");
  });

  it("no letter due and nothing hidden: nothing", () => {
    card(false, TODAY, false);
    expect(document.body.textContent).toBe("");
  });

  it("a failed Not now hides nothing and stores nothing", async () => {
    notNow.mockReturnValueOnce(Promise.resolve({ status: "error" }));
    card();
    await act(async () => fireEvent.click(screen.getByTestId("letter-card-not-now")));
    expect(screen.getByTestId("letter-card")).toBeInTheDocument();
    expect(window.localStorage.getItem(localKey("letter-card-hidden", "u1", TODAY))).toBeNull();
  });

  it("matched on the server, or a hard week: the help offer comes above the letter", () => {
    card(true);
    const help = screen.getByTestId("letter-help");
    expect(help).toHaveTextContent(messages.me.meGetHelpNow);
    expect(help.compareDocumentPosition(screen.getByTestId("letter-card")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("neither: no help offer added", () => {
    card(false);
    expect(screen.queryByTestId("letter-help")).toBeNull();
  });
});
