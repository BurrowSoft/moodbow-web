import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: keyof typeof messages.entry) => messages.entry[key] }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { EntryPreviews } = await import("./EntryPreviews");
afterEach(cleanup);

const ENTRIES = [
  { id: "e1", body: "Line one\nline two\nline three", is_moment: true, entry_date: "2026-10-19", created_at: "2026-10-19T12:12:00Z" },
  { id: "e2", body: "Short.", is_moment: false, entry_date: "2026-10-19", created_at: "2026-10-19T01:05:00Z" },
];

describe("EntryPreviews (decision 161)", () => {
  it("each card: the local time it was written (the profile's zone, the region's format), ★ for a moment, two lines of text", async () => {
    render(await EntryPreviews({ entries: ENTRIES, testIdPrefix: "today-entry", from: "/app", timeZone: "Asia/Bangkok", dateLocaleTag: "en-US" }));
    const first = screen.getByTestId("today-entry-e1");
    // 12:12 UTC is 7:12 PM in Bangkok.
    expect(within(first).getByText("7:12 PM")).toHaveAttribute("dateTime", "2026-10-19T12:12:00Z");
    expect(within(first).getByRole("img", { name: messages.entry.momentBadge })).toBeInTheDocument();
    expect(first.querySelector(".line-clamp-2")).not.toBeNull();
    expect(within(screen.getByTestId("today-entry-e2")).getByText("8:05 AM")).toBeInTheDocument();
    expect(within(screen.getByTestId("today-entry-e2")).queryByRole("img")).toBeNull();
  });

  it("the region's own format (a 24-hour region: no AM/PM)", async () => {
    render(await EntryPreviews({ entries: [ENTRIES[1]], testIdPrefix: "day-entry", from: "/app", timeZone: "Asia/Bangkok", dateLocaleTag: "en-GB" }));
    const time = screen.getByTestId("day-entry-e2").querySelector("time")!;
    expect(time.textContent).toMatch(/^0?8:05$/);
  });
});

describe("EntryPreviews: the time only on the entry's own day (UX, #63)", () => {
  it("a back-dated entry (written later for an earlier day) shows no time; the ★ stays", async () => {
    const backDated = { id: "e3", body: "Yesterday, remembered.", is_moment: true, entry_date: "2026-10-18", created_at: "2026-10-19T12:00:00Z" };
    render(await EntryPreviews({ entries: [backDated], testIdPrefix: "day-entry", from: "/app", timeZone: "Asia/Bangkok", dateLocaleTag: "en-US" }));
    const card = screen.getByTestId("day-entry-e3");
    expect(card.querySelector("time")).toBeNull();
    expect(within(card).getByRole("img", { name: messages.entry.momentBadge })).toBeInTheDocument();
  });

  it("the day is the profile's: 23:30 local is still that day though UTC is the next", async () => {
    // 23:30 in Los Angeles on Oct 18 is 06:30 UTC on Oct 19.
    const late = { id: "e4", body: "Late.", is_moment: false, entry_date: "2026-10-18", created_at: "2026-10-19T06:30:00Z" };
    render(await EntryPreviews({ entries: [late], testIdPrefix: "day-entry", from: "/app", timeZone: "America/Los_Angeles", dateLocaleTag: "en-US" }));
    expect(screen.getByTestId("day-entry-e4").querySelector("time")).toHaveTextContent("11:30 PM");
  });
});
