import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { WelcomeSlides } = await import("./WelcomeSlides");
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WelcomeSlides (a11y pass)", () => {
  it("Next and Skip move focus to the new slide's heading", () => {
    vi.useFakeTimers();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WelcomeSlides />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("welcome-next"));
    act(() => vi.runAllTimers());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(messages.onboarding.welcome2Title);
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    fireEvent.click(screen.getByTestId("welcome-skip"));
    act(() => vi.runAllTimers());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(messages.onboarding.welcome3Title);
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  // Web Tester batch E: the link was 185 x 20. min-h-11 is 44 px; the measured height is checked in Chromium.
  it("I already have an account has a 44 px tall tap area", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WelcomeSlides />
      </NextIntlClientProvider>,
    );
    const link = screen.getByTestId("welcome-have-account");
    expect(link).toHaveAttribute("href", "/sign-in");
    expect(link.className.split(" ")).toEqual(expect.arrayContaining(["inline-flex", "min-h-11", "items-center"]));
  });
});
