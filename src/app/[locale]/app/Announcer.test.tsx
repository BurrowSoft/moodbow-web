import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/app/entries/e1";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const { AnnouncerProvider, useAnnounce, useFocusTitleAfterLeaving } = await import("./Announcer");

const TITLE = "Timeline";

function Sayer({ text }: { text: string }) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce?.(text)}>
      {text}
    </button>
  );
}

function Leaver() {
  const focusTitle = useFocusTitleAfterLeaving();
  return (
    <button type="button" data-testid="leave" onClick={() => focusTitle?.()}>
      {TITLE}
    </button>
  );
}

// The layout's main, with the page in it (or, while it streams, without its title).
const Page = ({ title }: { title: boolean }) => (
  <AnnouncerProvider>
    <main id="main">
      {title && <h1>{TITLE}</h1>}
      <Leaver />
    </main>
  </AnnouncerProvider>
);

beforeEach(() => {
  vi.useFakeTimers();
  pathname = "/app/entries/e1";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AnnouncerProvider: one polite region above the routes", () => {
  it("always there; a notice is set, said again when repeated, and cleared after a while", () => {
    render(
      <AnnouncerProvider>
        <Sayer text="Entry deleted" />
      </AnnouncerProvider>,
    );
    const region = screen.getByTestId("app-announce");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(100));
    expect(region).toHaveTextContent("Entry deleted");
    // The same notice again: emptied first, so it's a change to announce.
    fireEvent.click(screen.getByRole("button"));
    expect(region).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(100));
    expect(region).toHaveTextContent("Entry deleted");
    act(() => vi.advanceTimersByTime(5000));
    expect(region).toBeEmptyDOMElement();
  });

  it("outside the provider there's nothing to call", () => {
    render(<Sayer text="x" />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });
});

describe("AnnouncerProvider: focus on the title after leaving (app #104)", () => {
  it("asked before a redirect: once the page has changed, focus goes to its h1 (not a tab stop)", () => {
    const view = render(<Page title={false} />);
    fireEvent.click(screen.getByTestId("leave"));
    pathname = "/app/timeline";
    view.rerender(<Page title />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveFocus();
    expect(h1).toHaveAttribute("tabindex", "-1");
  });

  it("not asked, or the page hasn't changed: focus stays where it is", () => {
    const view = render(<Page title />);
    pathname = "/app/timeline";
    view.rerender(<Page title />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    fireEvent.click(screen.getByTestId("leave"));
    view.rerender(<Page title />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
  });

  it("the title streaming in after the page changed: focused as soon as it's there", async () => {
    const view = render(<Page title={false} />);
    fireEvent.click(screen.getByTestId("leave"));
    pathname = "/app";
    view.rerender(<Page title={false} />);
    expect(document.body).toHaveFocus();
    await act(async () => view.rerender(<Page title />));
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("a request whose navigation never came expires: a later page change doesn't move focus", () => {
    const view = render(<Page title />);
    fireEvent.click(screen.getByTestId("leave"));
    act(() => vi.advanceTimersByTime(11_000));
    pathname = "/app/timeline";
    view.rerender(<Page title />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
  });
});
