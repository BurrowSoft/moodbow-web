import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { BoUnavailable } from "./BoUnavailable";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
// The help button is a locale link (#249).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);

describe("BoUnavailable", () => {
  it("a failed read: Try again and the help button, which opens the card, with or without a country", () => {
    for (const country of ["NZ", null]) {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <BoUnavailable country={country} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByTestId("try-again")).toBeInTheDocument();
      expect(screen.getByTestId("bo-get-help")).toHaveTextContent(messages.me.meGetHelpNow);
      fireEvent.click(screen.getByTestId("bo-get-help"));
      expect(screen.getByTestId("safety-card")).toBeInTheDocument();
      cleanup();
    }
  });
});
