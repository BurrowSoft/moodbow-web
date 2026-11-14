import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { PALETTE_KEY } from "@/lib/plus/palettes";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { Appearance } = await import("./Appearance");
const p = messages.plus;
const LATER = "2999-01-01T00:00:00.000Z";
const show = (palette: React.ComponentProps<typeof Appearance>["palette"]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Appearance palette={palette} />
    </NextIntlClientProvider>,
  );
beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.palette;
});
afterEach(cleanup);

describe("Me → Appearance: Plus's extra themes", () => {
  it("with Plus: Default, Dusk, Sunrise and Sea; a choice applies at once, kept with the date Plus runs to", () => {
    show({ until: LATER });
    expect(screen.getByRole("group", { name: p.paletteLegend })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: p.paletteDefault })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: p.paletteDusk }));
    expect(document.documentElement.dataset.palette).toBe("dusk");
    expect(window.localStorage.getItem(PALETTE_KEY)).toBe(`dusk@${LATER}`);
    expect(screen.getByTestId("me-palette-dusk")).toBeChecked();
    fireEvent.click(screen.getByTestId("me-palette-default"));
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });
  it("without Plus: a locked More themes row; a palette left from before goes back to the default", () => {
    window.localStorage.setItem(PALETTE_KEY, `sea@${LATER}`);
    document.documentElement.dataset.palette = "sea";
    act(() => {
      show({ trial: false, price: "US$59.99" });
    });
    expect(screen.getByTestId("me-palettes")).toHaveAttribute("data-locked", "");
    expect(screen.queryByRole("group", { name: p.paletteLegend })).toBeNull();
    expect(window.localStorage.getItem(PALETTE_KEY)).toBeNull();
    expect(document.documentElement.dataset.palette).toBeUndefined();
  });
  it("a renewal: the stored choice moves on to the entitlement's new end, even past its old date", () => {
    window.localStorage.setItem(PALETTE_KEY, "dusk@2020-01-01T00:00:00.000Z");
    act(() => {
      show({ until: LATER });
    });
    expect(window.localStorage.getItem(PALETTE_KEY)).toBe(`dusk@${LATER}`);
    expect(document.documentElement.dataset.palette).toBe("dusk");
    expect(screen.getByTestId("me-palette-dusk")).toBeChecked();
  });
  it("Plus on with a later end than stored: the date follows; no choice stored: nothing is written", () => {
    window.localStorage.setItem(PALETTE_KEY, "sea@2998-01-01T00:00:00.000Z");
    act(() => {
      show({ until: LATER });
    });
    expect(window.localStorage.getItem(PALETTE_KEY)).toBe(`sea@${LATER}`);
    cleanup();
    window.localStorage.clear();
    act(() => {
      show({ until: LATER });
    });
    expect(window.localStorage.getItem(PALETTE_KEY)).toBeNull();
    expect(screen.getByRole("radio", { name: p.paletteDefault })).toBeChecked();
  });
  it("a failed renewal: the payment line, not the lock, and the choice stays stored", () => {
    window.localStorage.setItem(PALETTE_KEY, `sea@${LATER}`);
    document.documentElement.dataset.palette = "sea";
    act(() => {
      show({ pastDue: true });
    });
    expect(screen.getByTestId("me-palettes-past-due")).toHaveTextContent(p.pastDue);
    expect(screen.queryByTestId("me-palettes")).toBeNull();
    expect(screen.queryByRole("group", { name: p.paletteLegend })).toBeNull();
    expect(window.localStorage.getItem(PALETTE_KEY)).toBe(`sea@${LATER}`);
    expect(document.documentElement.dataset.palette).toBe("sea");
  });
  it("Plus unreadable: nothing shown, nothing changed", () => {
    window.localStorage.setItem(PALETTE_KEY, `sea@${LATER}`);
    show(null);
    expect(screen.queryByTestId("me-palettes")).toBeNull();
    expect(window.localStorage.getItem(PALETTE_KEY)).toBe(`sea@${LATER}`);
  });
});
