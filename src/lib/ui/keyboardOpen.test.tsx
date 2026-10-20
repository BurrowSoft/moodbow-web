import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTextField, useKeyboardOpen } from "./keyboardOpen";

// A phone's visual viewport, which jsdom doesn't have.
class FakeViewport extends EventTarget {
  height = 800;
  scale = 1;
}
let vv: FakeViewport;
const setPhone = (coarse: boolean) => (window.matchMedia = vi.fn().mockReturnValue({ matches: coarse }) as unknown as typeof window.matchMedia);
const resize = (height: number, scale = 1) =>
  act(() => {
    vv.height = height;
    vv.scale = scale;
    vv.dispatchEvent(new Event("resize"));
  });

beforeEach(() => {
  vv = new FakeViewport();
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
  setPhone(true);
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const field = (html: string) => {
  document.body.innerHTML = html;
  const el = document.body.firstElementChild as HTMLElement;
  act(() => el.focus());
  return el;
};

describe("useKeyboardOpen", () => {
  it("a phone, a text field focused and the viewport down by more than a quarter: open; blur: closed", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useKeyboardOpen());
    const text = field("<textarea></textarea>");
    expect(result.current).toBe(false);
    resize(420);
    expect(result.current).toBe(true);
    act(() => text.blur());
    act(() => vi.runAllTimers());
    expect(result.current).toBe(false);
  });

  it("a hardware keyboard (focused, nothing shrinks) or pinch zoom (scale divides out): closed", () => {
    const { result } = renderHook(() => useKeyboardOpen());
    field('<input type="text">');
    resize(800);
    expect(result.current).toBe(false);
    resize(400, 2);
    expect(result.current).toBe(false);
  });

  it("not a text field (a button, a checkbox), or not a phone: closed", () => {
    const { result, unmount } = renderHook(() => useKeyboardOpen());
    field("<button>x</button>");
    resize(420);
    expect(result.current).toBe(false);
    unmount();
    setPhone(false);
    const desktop = renderHook(() => useKeyboardOpen());
    field("<textarea></textarea>");
    resize(420);
    expect(desktop.result.current).toBe(false);
  });
});

describe("isTextField", () => {
  it("text inputs and text areas, not checkboxes or buttons", () => {
    document.body.innerHTML = '<input type="email"><input type="checkbox"><textarea></textarea><button></button>';
    const [email, box, area, button] = [...document.body.children];
    expect([isTextField(email), isTextField(box), isTextField(area), isTextField(button), isTextField(null)]).toEqual([true, false, true, false, false]);
  });
});
