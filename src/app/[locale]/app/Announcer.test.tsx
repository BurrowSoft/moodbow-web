import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider, useAnnounce } from "./Announcer";

function Sayer({ text }: { text: string }) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce?.(text)}>
      {text}
    </button>
  );
}

beforeEach(() => vi.useFakeTimers());
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
