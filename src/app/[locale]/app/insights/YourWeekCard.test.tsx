import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dateLine, dateRangeLine } from "@/lib/journal/today";
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

describe("the first of a month in French", () => {
  it("reads 1er in a range, at either end, and in a date line", () => {
    expect(dateRangeLine("2026-10-26", "2026-11-01", "fr-FR")).toContain("1er novembre");
    expect(dateRangeLine("2026-06-01", "2026-06-07", "fr-FR")).toContain("1er");
    expect(dateLine("2026-11-01", "fr-FR")).toContain("1er novembre");
  });
  it("only the first, and only in French", () => {
    expect(dateRangeLine("2026-11-09", "2026-11-15", "fr-FR")).not.toContain("er");
    expect(dateRangeLine("2026-11-11", "2026-11-17", "fr-FR")).not.toContain("1er");
    expect(dateLine("2026-11-21", "fr-FR")).not.toContain("1er");
    expect(dateLine("2026-11-01", "en-NZ")).not.toContain("1er");
    expect(dateLine("2026-11-01", "pt-BR")).not.toContain("1er");
  });
});
