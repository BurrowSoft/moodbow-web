import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

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
