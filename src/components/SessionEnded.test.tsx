import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { SessionEnded } = await import("./SessionEnded");
afterEach(cleanup);

describe("SessionEnded: help stays (decision 218)", () => {
  it("the real button, and the card opens with its words", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SessionEnded />
      </NextIntlClientProvider>,
    );
    const help = screen.getByTestId("session-ended-help");
    expect(help).toHaveTextContent(messages.me.meGetHelpNow);
    fireEvent.click(help);
    expect(screen.getByText(messages.safety.safetyTitle)).toBeInTheDocument();
  });
});
