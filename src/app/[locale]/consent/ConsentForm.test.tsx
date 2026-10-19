import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("./actions", () => ({ giveConsent: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { ConsentForm } = await import("./ConsentForm");
afterEach(cleanup);

const renderIt = (askAi: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConsentForm askAge={false} askAi={askAi} showBack={false} />
    </NextIntlClientProvider>,
  );

describe("ConsentForm: the optional AI box (r1 §M3)", () => {
  it("hidden while this build doesn't show AI", () => {
    renderIt(false);
    expect(screen.queryByTestId("consent-ai")).toBeNull();
  });

  it("shown: never pre-ticked, never required, named by its title and described by what it means", () => {
    renderIt(true);
    const box = screen.getByTestId("consent-ai");
    expect(box).not.toBeChecked();
    expect(box).not.toBeRequired();
    expect(box).toHaveAccessibleName(messages.ai.consentAiTitle);
    expect(box).toHaveAccessibleDescription(messages.ai.consentAiBody);
    // Continue doesn't wait for it: the two required boxes are enough.
    fireEvent.click(screen.getByTestId("consent-privacy"));
    fireEvent.click(screen.getByTestId("consent-health"));
    expect(screen.getByTestId("consent-continue")).toBeEnabled();
  });
});
