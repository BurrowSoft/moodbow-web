import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.clearAllMocks();
});
const card = (helpFirst = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LetterCard id="a" writtenLabel="Friday, 9 October 2026" helpFirst={helpFirst} country="NZ" />
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
