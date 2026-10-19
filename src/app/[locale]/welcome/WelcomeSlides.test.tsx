import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/i18n/navigation", () => ({ Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
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
});
