import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const yes = { status: "ok", available: true, reason: null, pictures: false, maxChars: 2000 };
let status: unknown = yes;
vi.mock("./bo/useBoStatus", () => ({ useBoStatus: () => status }));
const { BoButton } = await import("./BoButton");
const boFocus = await import("./bo/boFocus");

const button = () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoButton uid="u1" />
    </NextIntlClientProvider>,
  );
  return screen.queryByTestId("bo-button");
};

beforeEach(() => {
  path = "/app";
  keyboard = false;
  status = yes;
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

  it("only on the status's word: until it answers, with no answer, or on a no, nothing; the budget's line and consent keep it", () => {
    for (const [given, shown] of [
      [null, false],
      [{ status: "no_answer" }, false],
      [{ ...yes, available: false, reason: "off" }, false],
      [{ ...yes, available: false, reason: "region_off" }, false],
      [{ ...yes, available: false, reason: "budget" }, true],
      [{ ...yes, available: false, reason: "consent" }, true],
    ] as const) {
      status = given;
      expect(button() !== null, JSON.stringify(given)).toBe(shown);
      cleanup();
    }
  });

  it("keeps its room at the page's end before the status answers, so nothing moves when it does", () => {
    status = null;
    expect(button()).toBeNull();
    expect(document.body).toHaveClass("has-bo-button");
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

    it("up to half the window: the words, on one line, and no icon", () => {
      wordsAre(window.innerWidth / 2 - 40);
      button();
      expect(screen.queryByTestId("bo-button-icon")).toBeNull();
      expect(screen.getByText(messages.bo.boButton)).toHaveClass("whitespace-nowrap");
      expect(screen.getByText(messages.bo.boButton)).not.toHaveClass("invisible");
    });

    it("past half the window: the icon alone, with the words as its name", () => {
      wordsAre(window.innerWidth / 2 - 39);
      button();
      expect(screen.getByTestId("bo-button-icon")).toBeInTheDocument();
      expect(screen.getByText(messages.bo.boButton)).toHaveClass("invisible");
      expect(screen.getByRole("link", { name: messages.bo.boButton })).toHaveAttribute("href", "/app/bo");
    });
  });
});

describe("BoButton: focus on the way back from Bo (UX, from A4)", () => {
  it("back from Bo with focus nowhere: the button takes it", () => {
    boFocus.markLeftBo();
    expect(button()).toHaveFocus();
  });

  it("back from Bo with focus already taken: it stays where it was", () => {
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    boFocus.markLeftBo();
    button();
    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
  });

  it("not coming back from Bo: the button never takes focus", () => {
    expect(button()).not.toHaveFocus();
  });

  it("opening Bo by the button (click or Enter) marks it, once", () => {
    fireEvent.click(button()!);
    expect(boFocus.takeOpenedByButton()).toBe(true);
    expect(boFocus.takeOpenedByButton()).toBe(false);
  });
});
