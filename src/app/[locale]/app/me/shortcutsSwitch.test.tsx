import { act, fireEvent, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SHORTCUTS_KEY } from "@/lib/shortcuts";

// Web Tester K6 (#97): a page that LOADS with shortcuts off (server HTML,
// then hydration), then the switch turned on: the keys work at once.
const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/app/me" }));
const { Appearance } = await import("./Appearance");
const { KeyboardShortcuts } = await import("../KeyboardShortcuts");

const tree = (
  <NextIntlClientProvider locale="en" messages={messages}>
    <KeyboardShortcuts search={false} />
    <Appearance shortcuts />
  </NextIntlClientProvider>
);
let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  push.mockReset();
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

const load = async () => {
  // The server never sees this device's choice (it renders "on").
  container.innerHTML = renderToString(tree);
  await act(async () => {
    root = hydrateRoot(container, tree);
  });
};
const sw = () => screen.getByRole("switch", { name: messages.me.shortcutsEnabled });

describe("the shortcuts switch across a page load (K6)", () => {
  it("loaded with shortcuts off: the switch says off, and turning it on works without a reload", async () => {
    window.localStorage.setItem(SHORTCUTS_KEY, "off");
    await load();
    expect(sw()).toHaveAttribute("aria-checked", "false");
    fireEvent.keyDown(document, { key: "t" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(sw());
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(SHORTCUTS_KEY)).toBeNull();
    fireEvent.keyDown(document, { key: "t" });
    expect(push).toHaveBeenCalledWith("/app/timeline");
  });

  it("loaded with shortcuts on: off applies at once, and on again works", async () => {
    await load();
    fireEvent.click(sw());
    expect(window.localStorage.getItem(SHORTCUTS_KEY)).toBe("off");
    fireEvent.keyDown(document, { key: "t" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(sw());
    fireEvent.keyDown(document, { key: "t" });
    expect(push).toHaveBeenCalledWith("/app/timeline");
  });
});
