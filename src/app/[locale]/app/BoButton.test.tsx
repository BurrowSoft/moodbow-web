import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

let path = "/app";
let keyboard = false;
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => path,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/ui/keyboardOpen", () => ({ useKeyboardOpen: () => keyboard }));
const { BoButton } = await import("./BoButton");

const button = () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoButton />
    </NextIntlClientProvider>,
  );
  return screen.queryByTestId("bo-button");
};

beforeEach(() => {
  path = "/app";
  keyboard = false;
});
afterEach(cleanup);

describe("BoButton", () => {
  it.each(["/app", "/app/timeline", "/app/insights", "/app/me"])("%s: shown, leading to Bo", (p) => {
    path = p;
    expect(button()).toHaveAttribute("href", "/app/bo");
  });

  it.each(["/app/write", "/app/bo", "/app/entries/x", "/app/timeline/2026-11-06", "/app/print/2026-11"])("%s: not at the top level, so not shown", (p) => {
    path = p;
    expect(button()).toBeNull();
  });

  it("out of the way while the on-screen keyboard is up", () => {
    keyboard = true;
    expect(button()).toBeNull();
  });

  it("gives the page's end room for it on the tabs, and takes it back", () => {
    button();
    expect(document.body).toHaveClass("has-bo-button");
    cleanup();
    expect(document.body).not.toHaveClass("has-bo-button");
    path = "/app/write";
    button();
    expect(document.body).not.toHaveClass("has-bo-button");
  });

  describe("words or icon (UX, #205)", () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
    const wordsAre = (px: number) => Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => px });
    beforeEach(() => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(private fit: () => void) {}
          observe() {
            this.fit();
          }
          disconnect() {}
        },
      );
    });
    afterEach(() => {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
      vi.unstubAllGlobals();
    });

    it("the words fit: the words, on one line, and no icon", () => {
      wordsAre(100);
      button();
      expect(screen.queryByTestId("bo-button-icon")).toBeNull();
      expect(screen.getByText(messages.bo.boButton)).toHaveClass("whitespace-nowrap");
      expect(screen.getByText(messages.bo.boButton)).not.toHaveClass("invisible");
    });

    it("they don't: the icon alone, with the words as its name", () => {
      wordsAre(window.innerWidth);
      button();
      expect(screen.getByTestId("bo-button-icon")).toBeInTheDocument();
      expect(screen.getByText(messages.bo.boButton)).toHaveClass("invisible");
      expect(screen.getByRole("link", { name: messages.bo.boButton })).toHaveAttribute("href", "/app/bo");
    });
  });
});
