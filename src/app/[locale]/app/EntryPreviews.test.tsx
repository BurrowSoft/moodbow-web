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
  { id: "e1", body: "Line one\nline two\nline three", is_moment: true, created_at: "2026-10-19T12:12:00Z" },
  { id: "e2", body: "Short.", is_moment: false, created_at: "2026-10-19T01:05:00Z" },
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
