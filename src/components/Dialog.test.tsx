import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";

// The dialog's focus trap (a11y pass: Shift+Tab from a focused title used
// to leave the dialog).
afterEach(cleanup);

// Test names (not user-facing copy).
const L = { title: "Title", behind: "behind", link: "link", one: "one", two: "two" };

const renderIt = (initialFocus?: "first" | "last" | "title") =>
  render(
    <>
      <button type="button" aria-label={L.behind} />
      <Dialog title={L.title} onCancel={() => {}} initialFocus={initialFocus}>
        <a href="#x" aria-label={L.link} />
        <button type="button" aria-label={L.one} />
        <button type="button" aria-label={L.two} />
      </Dialog>
    </>,
  );

describe("Dialog taller than the window (large text; Web Tester, #198)", () => {
  const tall = (height: number) => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => height });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  };
  afterEach(() => {
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  });

  it("opens on its title, not on a button past it, and shows there's more", () => {
    tall(1200);
    renderIt();
    expect(screen.getByRole("heading", { name: "Title" })).toHaveFocus();
    expect(screen.getByTestId("dialog-more")).toBeInTheDocument();
  });

  it("the fade goes at the end of the dialog and comes back on the way up", () => {
    tall(1200);
    renderIt();
    const dialog = screen.getByRole("dialog");
    expect(screen.getByTestId("dialog-more")).not.toHaveClass("opacity-0");
    fireEvent.scroll(dialog, { target: { scrollTop: 600 } });
    expect(screen.getByTestId("dialog-more")).toHaveClass("opacity-0");
    fireEvent.scroll(dialog, { target: { scrollTop: 100 } });
    expect(screen.getByTestId("dialog-more")).not.toHaveClass("opacity-0");
  });

  it("the same with a last-button dialog", () => {
    tall(1200);
    renderIt("last");
    expect(screen.getByRole("heading", { name: "Title" })).toHaveFocus();
  });

  it("when it fits: the first action as before, and no fade", () => {
    tall(500);
    renderIt();
    expect(screen.getByRole("link", { name: "link" })).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "one" })).toHaveFocus();
    expect(screen.queryByTestId("dialog-more")).toBeNull();
  });
});

describe("Dialog focus trap", () => {
  it("from the focused title: Shift+Tab goes to the last control, Tab to the first; never behind", () => {
    renderIt("title");
    expect(screen.getByRole("heading", { name: "Title" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "two" })).toHaveFocus();
    screen.getByRole("heading", { name: "Title" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("link", { name: "link" })).toHaveFocus();
  });

  it("wraps at both ends", () => {
    renderIt();
    screen.getByRole("button", { name: "two" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("link", { name: "link" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "two" })).toHaveFocus();
  });

  it("focus that got behind it comes back in", () => {
    renderIt();
    screen.getByRole("button", { name: "behind" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("link", { name: "link" })).toHaveFocus();
  });
});

describe("Dialog: the page behind is inert while it's open (a11y pass)", () => {
  it("everything but the dialog gets inert; it's restored when the dialog closes; an element already inert stays so", () => {
    const already = document.createElement("div");
    already.setAttribute("inert", "");
    document.body.appendChild(already);
    const view = renderIt();
    const page = screen.getByRole("button", { name: "behind" }).closest("body > *")!;
    const dialog = screen.getByRole("dialog").closest("body > *")!;
    expect(page).toHaveAttribute("inert");
    expect(dialog).not.toHaveAttribute("inert");
    view.unmount();
    expect(page).not.toHaveAttribute("inert");
    expect(already).toHaveAttribute("inert");
    already.remove();
  });
});
