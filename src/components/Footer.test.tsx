import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The footer's Moodbow Plus link (1.3 §6): what's free and what's Plus, one click from any page,
// signed out too. Like every footer link, only once its page is live (plus met).
let met: string[] = [];
vi.mock("@/lib/conditions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conditions")>()),
  conditionMet: (id: string) => met.includes(id),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: keyof typeof messages) => (key: string) => (messages[ns] as Record<string, string>)[key],
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("./LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("./TryAppButton", () => ({ TryAppButton: () => null }));
const { Footer } = await import("./Footer");
afterEach(cleanup);

describe("Footer: Moodbow Plus", () => {
  it("not before Plus is live", async () => {
    met = [];
    render(await Footer());
    expect(screen.queryByTestId("footer-moodbow-plus")).toBeNull();
  });
  it("with Plus live: Moodbow Plus, to its Help article", async () => {
    met = ["plus"];
    render(await Footer());
    const link = screen.getByTestId("footer-moodbow-plus");
    expect(link).toHaveAttribute("href", "/help/moodbow-plus");
    expect(link).toHaveTextContent(messages.plus.label);
  });
});
