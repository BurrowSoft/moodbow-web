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
