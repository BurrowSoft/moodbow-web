import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { THEME_KEY } from "@/lib/appearance";
import { Appearance } from "./Appearance";

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Appearance />
    </NextIntlClientProvider>,
  );
beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(cleanup);

describe("Me → Appearance (decision 133)", () => {
  it("Same as device by default; a choice applies at once and is kept on this device", () => {
    renderIt();
    expect(screen.getByRole("group", { name: messages.me.meAppearance })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: messages.me.themeSystem })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: messages.me.themeDark }));
    expect(screen.getByTestId("me-theme-dark")).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    fireEvent.click(screen.getByTestId("me-theme-system"));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("shows what this device has", () => {
    window.localStorage.setItem(THEME_KEY, "light");
    renderIt();
    expect(screen.getByTestId("me-theme-light")).toBeChecked();
  });
});

describe("Me → Appearance: another tab's change (review of #41)", () => {
  it("a storage event for the theme updates this page's data-theme and the radios", () => {
    renderIt();
    window.localStorage.setItem(THEME_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY, newValue: "dark" }));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByTestId("me-theme-dark")).toBeChecked();
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(screen.getByTestId("me-theme-system")).toBeChecked();
  });
});

describe("Me → Appearance with storage blocked (Web Tester #41)", () => {
  it("choosing Dark darkens the page and the radio shows Dark", () => {
    const blocked = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    renderIt();
    fireEvent.click(screen.getByTestId("me-theme-dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByTestId("me-theme-dark")).toBeChecked();
    get.mockRestore();
    set.mockRestore();
  });
});
