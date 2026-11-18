import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Today's Year card (1.4 A): its "New" label, 1 to 7 December (UX, 19 Nov), before the title.
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: keyof typeof messages) => (key: string, values: Record<string, unknown> = {}) =>
    String((messages[ns] as Record<string, string>)[key]).replace(/\{(\w+)\}/g, (_, k: string) => String(values[k])),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { YearTodayCard } = await import("./YearLink");
afterEach(cleanup);

describe("YearTodayCard", () => {
  it('"New" before the title, when asked; inside the heading so it\'s read first', async () => {
    render(await YearTodayCard({ year: 2026, query: "", isNew: true }));
    const label = screen.getByTestId("year-today-new");
    expect(label).toHaveTextContent(messages.year.new);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(`${messages.year.new}${messages.year.title}`);
  });

  it("no label otherwise", async () => {
    render(await YearTodayCard({ year: 2026, query: "" }));
    expect(screen.queryByTestId("year-today-new")).toBeNull();
    expect(screen.getByTestId("year-today-open")).toHaveAttribute("href", "/app/year");
  });
});
