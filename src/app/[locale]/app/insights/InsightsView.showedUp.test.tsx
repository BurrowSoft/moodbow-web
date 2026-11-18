import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import fr from "@/messages/fr.json";
import de from "@/messages/de.json";
import type { ShowedUpRange } from "@/lib/journal/showedUp";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { InsightsView } = await import("./InsightsView");
afterEach(cleanup);

const view = (showedUp: { count: number; range: ShowedUpRange } | undefined, locale = "en", m: object = messages) =>
  render(
    <NextIntlClientProvider locale={locale} messages={m}>
      <InsightsView rows={[]} today="2026-11-18" range="week" showedUp={showedUp} />
    </NextIntlClientProvider>,
  );

describe("Days you showed up on Insights (1.4 C)", () => {
  it("the shown range's count, in its words", () => {
    const cases: [number, ShowedUpRange, string][] = [
      [1, "week", "You showed up on 1 day this week."],
      [14, "month", "You showed up on 14 days this month."],
      [40, "threeMonths", "You showed up on 40 days in the last 3 months."],
      [200, "year", "You showed up on 200 days in the last 12 months."],
      [1200, "all", "You showed up on 1,200 days since you started."],
    ];
    for (const [count, range, text] of cases) {
      view({ count, range });
      expect(screen.getByTestId("insights-showed-up").textContent).toBe(text);
      cleanup();
    }
  });

  it("never says streak, chain or break, in any language shipped", () => {
    for (const [locale, m] of [["en", messages], ["fr", fr], ["de", de]] as const) {
      view({ count: 3, range: "week" }, locale, m);
      expect(screen.getByTestId("insights-showed-up").textContent).not.toMatch(/streak|chain|break|série|Serie/i);
      cleanup();
    }
  });

  it("German puts the range first, as the app does", () => {
    view({ count: 14, range: "month" }, "de", de);
    expect(screen.getByTestId("insights-showed-up").textContent).toBe("Diesen Monat warst du an 14 Tagen da.");
  });

  it("no line while its condition is off", () => {
    view(undefined);
    expect(screen.queryByTestId("insights-showed-up")).toBeNull();
  });
});
