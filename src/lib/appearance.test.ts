import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTheme, THEME_KEY, THEME_PRE_PAINT, writeTheme } from "./appearance";

// Me → Appearance storage (decision 133): this device only, applied to
// <html data-theme>, and never breaking on a blocked storage.
beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.restoreAllMocks());

describe("appearance", () => {
  it("light / dark are stored and applied; system removes both", () => {
    expect(readTheme()).toBe("system");
    writeTheme("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readTheme()).toBe("dark");
    writeTheme("system");
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("junk in storage reads as system", () => {
    window.localStorage.setItem(THEME_KEY, "neon");
    expect(readTheme()).toBe("system");
  });

  it("blocked storage: reads as system; a choice still applies for the page", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readTheme()).toBe("system");
    expect(() => writeTheme("light")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("the pre-paint script sets data-theme from storage, ignores junk, and never throws", () => {
    const run = () => new Function(THEME_PRE_PAINT)();
    window.localStorage.setItem(THEME_KEY, "dark");
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
    delete document.documentElement.dataset.theme;
    window.localStorage.setItem(THEME_KEY, "<script>");
    run();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
  });
});
