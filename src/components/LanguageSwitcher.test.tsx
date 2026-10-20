import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The switcher offers Thai only once thai-offered-live is met (1.1 F): a
// draft /th on a test build is reachable by its address, never offered.
let offered: ("en" | "th")[] = ["en"];
vi.mock("@/i18n/routing", () => ({ offeredLocales: () => offered }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/help",
  Link: ({ children, href, locale, ...rest }: { children: React.ReactNode; href: string; locale: string }) => (
    <a href={`/${locale}${href}`} {...rest}>
      {children}
    </a>
  ),
}));
const { LanguageSwitcher } = await import("./LanguageSwitcher");

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );
afterEach(cleanup);

describe("LanguageSwitcher", () => {
  it("unmet (English only offered): no switcher at all", () => {
    offered = ["en"];
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
  });

  it("met: English is the current one, ไทย links to the same page in Thai", () => {
    offered = ["en", "th"];
    renderIt();
    const nav = screen.getByRole("navigation", { name: messages.common.language });
    expect(nav).toHaveTextContent("English");
    const th = screen.getByRole("link", { name: "ไทย" });
    expect(th).toHaveAttribute("href", "/th/help");
    expect(th).toHaveAttribute("lang", "th");
  });
});
