import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
