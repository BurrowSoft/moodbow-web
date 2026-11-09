import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { JournalUnavailable } = await import("./JournalUnavailable");
afterEach(cleanup);

const renderIt = (standalone?: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <JournalUnavailable standalone={standalone} />
    </NextIntlClientProvider>,
  );

describe("JournalUnavailable landmarks (Web Tester's a11y note)", () => {
  it("inside a journal page: a section, so the layout's <main id=main> stays the only one", () => {
    const { container } = renderIt();
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("#main")).toBeNull();
    expect(screen.getByTestId("journal-unavailable").tagName).toBe("SECTION");
  });

  it("as the whole page (the layout itself, Set up): the page's <main id=main>", () => {
    renderIt(true);
    const root = screen.getByTestId("journal-unavailable");
    expect(root.tagName).toBe("MAIN");
    expect(root.id).toBe("main");
    expect(screen.getByRole("alert")).toHaveTextContent(messages.auth.errGeneric);
  });
});

describe("JournalUnavailable: help is there whatever failed (decision 218)", () => {
  it.each([false, true])("standalone %s: the real button, and the card opens with its words", (standalone) => {
    renderIt(standalone);
    const help = screen.getByTestId("journal-unavailable-help");
    expect(help).toHaveTextContent(messages.me.meGetHelpNow);
    fireEvent.click(help);
    expect(screen.getByText(messages.safety.safetyTitle)).toBeInTheDocument();
  });
});

describe("JournalUnavailable: help first (UX, Web Tester at 320 px and 300 %)", () => {
  it.each([false, true])("standalone %s: help comes right after the heading, before Try again", (standalone) => {
    renderIt(standalone);
    const heading = screen.getByRole("heading", { name: messages.auth.errGeneric });
    const help = screen.getByTestId("journal-unavailable-help");
    const retry = screen.getByTestId("try-again");
    expect(heading.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(help.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
