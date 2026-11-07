import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Today always keeps check-in and Write, with errors beside them (specs/next-release.md).
let checkInError: unknown = null;
let entriesError: unknown = null;
const query = (result: () => unknown) => {
  const chain: Record<string, unknown> = {};
  for (const step of ["select", "eq", "order"]) chain[step] = () => chain;
  chain.maybeSingle = async () => result();
  chain.then = (done: (value: unknown) => unknown) => Promise.resolve(result()).then(done);
  return chain;
};
const client = {
  from: (table: string) => (table === "check_ins" ? query(() => ({ data: null, error: checkInError })) : query(() => ({ data: entriesError ? null : [], error: entriesError }))),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client }));
vi.mock("@/lib/journal/currentUser", () => ({ currentUser: async () => ({ user: { id: "u1" }, ended: false }) }));
vi.mock("@/lib/journal/me", () => ({ getMe: async () => ({ today: "2026-11-07", profile: { country: null, time_zone: "UTC" } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: () => {}, getTranslations: async () => (k: string) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/share/milestoneData", () => ({ loadMilestone: async () => null }));
vi.mock("./CheckInCard", () => ({ CheckInCard: () => <div data-testid="checkin-card" /> }));
vi.mock("./EntryPreviews", () => ({ EntryPreviews: () => null }));
vi.mock("./MilestoneCard", () => ({ MilestoneCard: () => null }));
vi.mock("@/components/JournalUnavailable", () => ({ JournalUnavailable: () => <div data-testid="journal-unavailable" /> }));
vi.mock("@/components/SessionEnded", () => ({ SessionEnded: () => null }));
const { default: TodayPage } = await import("./page");

const open = async () => render(await TodayPage({ params: Promise.resolve({ locale: "en" }) } as never));

beforeEach(() => {
  checkInError = null;
  entriesError = null;
});
afterEach(cleanup);

describe("Today, whatever failed", () => {
  it("today's check-in couldn't be read: the card and Write stay, with the error beside them", async () => {
    checkInError = { message: "boom" };
    await open();
    expect(screen.getByTestId("today-checkin-error")).toBeInTheDocument();
    expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
    expect(screen.getByTestId("today-write")).toHaveAttribute("href", "/app/write");
    expect(screen.queryByTestId("journal-unavailable")).toBeNull();
  });
  it("the entries couldn't be read: the same", async () => {
    entriesError = { message: "boom" };
    await open();
    expect(screen.getByTestId("today-entries-error")).toBeInTheDocument();
    expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
    expect(screen.getByTestId("today-write")).toBeInTheDocument();
  });
  it("nothing failed: no error", async () => {
    await open();
    expect(screen.queryByTestId("today-checkin-error")).toBeNull();
  });
});
