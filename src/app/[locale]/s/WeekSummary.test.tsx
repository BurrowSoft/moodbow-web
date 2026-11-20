import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LARGE_TEXT_CAP } from "@/lib/ui/largeText";
import { WeekSummary, type WeekStrings } from "./WeekSummary";

// UX, 20 Nov (the Web Tester at fr 320 px / 300 %: "Semaine du 16 novembr / e", and "lun. mar. mer." drawn on top of
// each other). The layout is checked in a real browser (e2e/large-text.spec.ts); this pins the markup it relies on.
const strings: WeekStrings = {
  weekOf: "Semaine du {date}",
  checkIns: Array.from({ length: 8 }, (_, n) => `${n} check-ins`),
  routinePercent: "{name} : {percent} %",
  routineNotEnough: "{name} : pas assez de jours",
  none: "Aucun check-in",
  dayNone: "{day} : pas de check-in",
  moods: ["1", "2", "3", "4", "5"],
};
const week = { week_start: "2026-11-16", days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${16 + i}`, mood: i === 0 ? 4 : null })), check_ins: 1 };

describe("WeekSummary at large text", () => {
  it("capped (decision 231), its heading and labels sized from the cap, not the page's rem", () => {
    const { container } = render(<WeekSummary week={week} strings={strings} locale="fr-FR" headingId="h" />);
    expect((container.firstElementChild as HTMLElement).className).toContain(LARGE_TEXT_CAP);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Semaine du 16 novembre");
    expect(heading.className).not.toMatch(/\btext-(xs|sm|base|lg)\b/);
    expect(container.querySelector('[data-testid="shared-days"] li span')!.className).toContain("text-[0.75em]");
  });
  it("each day's label in both forms, the short one and one letter (globals.css shows one by the 13em query); the long day for screen readers", () => {
    const { container } = render(<WeekSummary week={week} strings={strings} locale="fr-FR" headingId="h" />);
    const days = [...container.querySelectorAll('[data-testid="shared-days"] li')];
    expect(days.map((d) => d.querySelector('[data-day-form="short"]')!.textContent)).toEqual(["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]);
    expect(days.map((d) => d.querySelector('[data-day-form="narrow"]')!.textContent)).toEqual(["L", "M", "M", "J", "V", "S", "D"]);
    expect(days.every((d) => d.querySelector('[data-day-form="short"]')!.parentElement!.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(days[0].querySelector(".sr-only")).toHaveTextContent("lundi: 4");
  });
});
