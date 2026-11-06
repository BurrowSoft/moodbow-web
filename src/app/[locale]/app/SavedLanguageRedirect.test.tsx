import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

let search = "";
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/email-confirmed" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
// Tried moments ago: it stays with the link, the case that's left to test here.
vi.mock("@/lib/savedLanguage", () => ({ mayMoveTo: () => false, goToLanguage: vi.fn() }));
const { SavedLanguageRedirect } = await import("./SavedLanguageRedirect");

const link = () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SavedLanguageRedirect locale="fr" />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId("saved-language-link");
};

beforeEach(() => {
  search = "";
});
afterEach(cleanup);

describe("SavedLanguageRedirect: the link when the move can't happen", () => {
  it("keeps the query, or an expired link would read as confirmed (Reviewer, #196)", () => {
    search = "result=expired";
    expect(link()).toHaveAttribute("href", "/fr/email-confirmed?result=expired");
  });

  it("no query: the page's address alone", () => {
    expect(link()).toHaveAttribute("href", "/fr/email-confirmed");
  });

  it("the footer's language switcher steps aside while it's up", () => {
    link();
    expect(document.documentElement).toHaveAttribute("data-signed-in");
    cleanup();
    expect(document.documentElement).not.toHaveAttribute("data-signed-in");
  });
});
