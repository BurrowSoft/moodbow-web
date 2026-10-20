import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The "loading" line is filled 100 ms after the dialog opens. That timer is
// cleared on close and on unmount, so it never fires after the dialog (or
// the page) is gone; it used to, after a test's jsdom was torn down (a
// flaky "window is not defined" on #104's CI).
const loadMonthCheckIns = vi.fn();
vi.mock("./shareActions", () => ({ loadMonthCheckIns: (...a: unknown[]) => loadMonthCheckIns(...a), loadYearCheckIns: vi.fn() }));
vi.mock("@/lib/share/drawCard", () => ({ drawCard: vi.fn() }));
const { ShareMonth } = await import("./ShareMonth");

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShareMonth month="2026-10" dateLocaleTag="en-US" />
    </NextIntlClientProvider>,
  );

// The id of the 100 ms timer that opening the dialog started.
function openAndGetTimer(setSpy: ReturnType<typeof vi.spyOn>) {
  fireEvent.click(screen.getByTestId("share-open"));
  const i = setSpy.mock.calls.findIndex((call: unknown[]) => call[1] === 100);
  expect(i).toBeGreaterThanOrEqual(0);
  return setSpy.mock.results[i].value as number;
}

beforeEach(() => {
  // Never answers: the dialog stays on "loading".
  loadMonthCheckIns.mockReset().mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShareMonth: the loading line's timer", () => {
  it("unmounting within 100 ms of opening clears it", () => {
    const set = vi.spyOn(window, "setTimeout");
    const clear = vi.spyOn(window, "clearTimeout");
    renderIt();
    const timer = openAndGetTimer(set);
    cleanup();
    expect(clear).toHaveBeenCalledWith(timer);
  });

  it("closing the dialog within 100 ms clears it", () => {
    const set = vi.spyOn(window, "setTimeout");
    const clear = vi.spyOn(window, "clearTimeout");
    renderIt();
    const timer = openAndGetTimer(set);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(clear).toHaveBeenCalledWith(timer);
  });
});
