import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dateLine, dateLocale, dateRangeLine } from "@/lib/journal/today";
import { YourWeekCard } from "./YourWeekCard";

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/SafetyCard", () => ({ GetHelpNow: () => null }));
afterEach(cleanup);

describe("YourWeekCard", () => {
  it("the caption comes straight after the pattern, before the moment's link", async () => {
    render(
      await YourWeekCard({
        week: { start: "2026-10-26", end: "2026-11-01", kind: "lines", lines: [{ template: "patternSleep" }, { template: "moment", id: "a", date: "2026-10-28" }], caption: true },
        country: "NZ",
        dateLocaleTag: "en-NZ",
      }),
    );
    const pattern = screen.getByTestId("your-week-patternSleep");
    const caption = screen.getByTestId("your-week-caption");
    const moment = screen.getByTestId("your-week-moment");
    expect(pattern.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.compareDocumentPosition(moment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the first of a month in French and Brazilian Portuguese", () => {
  it("reads 1er in a range, at either end, and in a date line", () => {
    expect(dateRangeLine("2026-10-26", "2026-11-01", "fr-FR")).toContain("1er novembre");
    expect(dateRangeLine("2026-06-01", "2026-06-07", "fr-FR")).toContain("1er");
    expect(dateLine("2026-11-01", "fr-FR")).toContain("1er novembre");
    expect(dateRangeLine("2026-10-26", "2026-11-01", "pt-BR")).toContain("1º de novembro");
    expect(dateLine("2026-11-01", "pt-BR")).toContain("1º de novembro");
  });
  it("follows the language alone, not the country", () => {
    const brazilianInFrance = dateLocale("pt-br", null, "FR");
    expect(dateLine("2026-11-01", brazilianInFrance)).toContain("1º de novembro");
    expect(dateRangeLine("2026-10-26", "2026-11-01", brazilianInFrance)).toContain("1º de novembro");
    expect(dateLine("2026-11-01", dateLocale("pt-br", null, null))).toContain("1º de novembro");
    expect(dateLine("2026-11-01", dateLocale("fr", null, "CA"))).toContain("1er novembre");
    expect(dateLine("2026-11-01", dateLocale("en", null, "FR"))).not.toContain("1er");
  });
  it("only the first, and only those two", () => {
    expect(dateRangeLine("2026-11-09", "2026-11-15", "fr-FR")).not.toContain("er");
    expect(dateRangeLine("2026-11-11", "2026-11-17", "fr-FR")).not.toContain("1er");
    expect(dateLine("2026-11-21", "fr-FR")).not.toContain("1er");
    expect(dateLine("2026-11-01", "en-NZ")).not.toContain("1er");
    expect(dateLine("2026-11-21", "pt-BR")).not.toContain("1º");
    expect(dateLine("2026-11-01", "es-MX")).toContain("1 de noviembre");
  });
});

describe("YourWeekCard: a hard week and the safety plan (1.2)", () => {
  const hard = { start: "2026-10-26", end: "2026-11-01", kind: "hard" } as const;
  it("with content: the plan's link beside the help", async () => {
    render(await YourWeekCard({ week: hard, country: "NZ", dateLocaleTag: "en-NZ", planLink: true }));
    expect(screen.getByTestId("your-week-plan")).toHaveAttribute("href", "/app/me/safety-plan");
  });
  it("without: no link", async () => {
    render(await YourWeekCard({ week: hard, country: "NZ", dateLocaleTag: "en-NZ" }));
    expect(screen.queryByTestId("your-week-plan")).toBeNull();
  });
});
