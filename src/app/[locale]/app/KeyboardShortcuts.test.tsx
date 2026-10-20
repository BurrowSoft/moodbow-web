import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SHORTCUTS_KEY } from "@/lib/shortcuts";
import { takeArrival } from "@/lib/ui/arrival";

const push = vi.fn();
let pathname = "/app/insights";
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => pathname }));
const { KeyboardShortcuts } = await import("./KeyboardShortcuts");

const m = messages.me;
const renderIt = (search = true) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <KeyboardShortcuts search={search} />
      <input data-testid="field" />
    </NextIntlClientProvider>,
  );
const key = (k: string, target: Element | Document = document, over: object = {}) => fireEvent.keyDown(target, { key: k, ...over });

beforeEach(() => {
  push.mockReset();
  pathname = "/app/insights";
  window.localStorage.clear();
  takeArrival("checkIn");
  takeArrival("search");
});
afterEach(cleanup);

describe("KeyboardShortcuts (1.1 O)", () => {
  it("n, t, i go to a new entry, Timeline and Insights", () => {
    renderIt();
    key("n");
    key("t");
    key("i");
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/app/write", "/app/timeline", "/app/insights"]);
  });

  it("c goes to Today and asks for the check-in's focus; already on Today, it only asks", () => {
    renderIt();
    key("c");
    expect(push).toHaveBeenCalledWith("/app");
    expect(takeArrival("checkIn")).toBe(true);
    cleanup();
    pathname = "/app";
    push.mockReset();
    renderIt();
    key("c");
    expect(push).not.toHaveBeenCalled();
    expect(takeArrival("checkIn")).toBe(true);
  });

  it("/ asks the Timeline to open its search, only when search is live", () => {
    renderIt(false);
    key("/");
    expect(push).not.toHaveBeenCalled();
    cleanup();
    renderIt(true);
    key("/");
    expect(push).toHaveBeenCalledWith("/app/timeline");
    expect(takeArrival("search")).toBe(true);
  });

  it("nothing while typing, or with Ctrl/Cmd/Alt", () => {
    renderIt();
    key("t", screen.getByTestId("field"));
    key("t", document, { ctrlKey: true });
    key("t", document, { metaKey: true });
    key("t", document, { altKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("? lists the shortcuts and how to turn them off; Close returns", () => {
    renderIt(false);
    key("?", document, { shiftKey: true });
    const dialog = screen.getByTestId("shortcuts-dialog");
    expect(dialog).toHaveAccessibleName(m.shortcutsTitle);
    for (const label of [m.shortcutNew, m.shortcutCheckIn, m.shortcutTimeline, m.shortcutInsights]) expect(dialog).toHaveTextContent(label);
    // "?" itself is listed too (UX).
    expect([...dialog.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["n", "c", "t", "i", "?"]);
    expect(dialog).not.toHaveTextContent(m.shortcutSearch);
    expect(dialog).toHaveTextContent(m.shortcutsOff);
    // A key inside the dialog does nothing.
    key("t", dialog);
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("shortcuts-close"));
    expect(screen.queryByTestId("shortcuts-dialog")).toBeNull();
  });

  it("turned off in Me → Appearance: no key does anything", () => {
    window.localStorage.setItem(SHORTCUTS_KEY, "off");
    renderIt();
    key("t");
    key("?", document, { shiftKey: true });
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("shortcuts-dialog")).toBeNull();
  });
});
