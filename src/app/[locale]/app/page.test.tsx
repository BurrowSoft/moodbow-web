import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Today always keeps check-in and Write, with errors beside them (specs/next-release.md).
let checkInError: unknown = null;
let entriesError: unknown = null;
let securityAnswer: { data: unknown; error: unknown } = { data: null, error: null };
const query = (result: () => unknown) => {
  const chain: Record<string, unknown> = {};
  for (const step of ["select", "eq", "order"]) chain[step] = () => chain;
  chain.maybeSingle = async () => result();
  chain.then = (done: (value: unknown) => unknown) => Promise.resolve(result()).then(done);
  return chain;
};
const client = {
  rpc: async () => securityAnswer,
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
// first: what the card had when it mounted, as the real card only reads `initial` then.
vi.mock("./CheckInCard", async () => {
  const { useState } = await import("react");
  const CheckInCard = ({ loadFailed }: { loadFailed?: boolean }) => {
    const [first] = useState(loadFailed);
    return <div data-testid="checkin-card" data-load-failed={String(loadFailed)} data-first={String(first)} />;
  };
  return { CheckInCard };
});
vi.mock("./SecurityNotice", () => ({ SecurityNotice: ({ id, uid }: { id: string; uid: string }) => <div data-testid="security-notice" data-id={id} data-uid={uid} /> }));
vi.mock("./EntryPreviews", () => ({ EntryPreviews: () => null }));
vi.mock("./MilestoneCard", () => ({ MilestoneCard: () => null }));
vi.mock("@/components/JournalUnavailable", () => ({ JournalUnavailable: () => <div data-testid="journal-unavailable" /> }));
vi.mock("@/components/SessionEnded", () => ({ SessionEnded: () => null }));
const { default: TodayPage } = await import("./page");

const page = () => TodayPage({ params: Promise.resolve({ locale: "en" }) } as never);
const open = async () => render(await page());

beforeEach(() => {
  checkInError = null;
  entriesError = null;
  securityAnswer = { data: null, error: null };
});
afterEach(cleanup);

describe("Today, whatever failed", () => {
  it("today's check-in couldn't be read: the card and Write stay, with the error beside them", async () => {
    checkInError = { message: "boom" };
    await open();
    expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-load-failed", "true");
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
    expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-load-failed", "false");
  });
  it("a security update out: its card, for this person and update", async () => {
    securityAnswer = { data: "2026-12-01-a", error: null };
    await open();
    expect(screen.getByTestId("security-notice")).toHaveAttribute("data-id", "2026-12-01-a");
    expect(screen.getByTestId("security-notice")).toHaveAttribute("data-uid", "u1");
  });
  it("none out, or the read failed: no card, and Today is whole", async () => {
    await open();
    expect(screen.queryByTestId("security-notice")).toBeNull();
    cleanup();
    securityAnswer = { data: null, error: { message: "boom" } };
    await open();
    expect(screen.queryByTestId("security-notice")).toBeNull();
    expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
  });
  it("Try again brings the real row: a new card, as the old one only read its first", async () => {
    checkInError = { message: "boom" };
    const { rerender } = await open();
    checkInError = null;
    rerender(await page());
    expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-first", "false");
  });
});
