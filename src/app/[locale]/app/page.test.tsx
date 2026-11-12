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
  // A read that never answers: the page must not wait for it.
  rpc: vi.fn(() => new Promise(() => {})),
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
vi.mock("./SecurityNoticeRead", () => ({ SecurityNoticeRead: ({ uid }: { uid: string }) => <div data-testid="security-read" data-uid={uid} /> }));
vi.mock("./EntryPreviews", () => ({ EntryPreviews: () => null }));
vi.mock("./MilestoneCard", () => ({ MilestoneCard: () => null }));
vi.mock("@/components/JournalUnavailable", () => ({ JournalUnavailable: () => <div data-testid="journal-unavailable" /> }));
vi.mock("@/components/SessionEnded", () => ({ SessionEnded: () => null }));
// Its own tests are SafetyCard.test.tsx; here, only what Today gives it.
vi.mock("@/components/SafetyCard", () => ({
  GetHelpNow: ({ testId, country, neutral, icon }: { testId: string; country: string | null | undefined; neutral?: boolean; icon?: boolean }) => (
    <a data-testid={testId} data-country={String(country)} data-neutral={String(neutral)} data-icon={String(icon)} />
  ),
}));
const { default: TodayPage } = await import("./page");

const page = () => TodayPage({ params: Promise.resolve({ locale: "en" }) } as never);
const open = async () => render(await page());

beforeEach(() => {
  checkInError = null;
  entriesError = null;
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
  // UX & PM, 13 Nov: Today's standing help, Me's card as a lifebuoy, in the header, always.
  it("the lifebuoy is in Today's header, Me's neutral help, whatever failed or not", async () => {
    for (const [c, e] of [[null, null], [{ message: "boom" }, null], [null, { message: "boom" }]] as const) {
      checkInError = c;
      entriesError = e;
      await open();
      const help = screen.getByTestId("today-help");
      expect(help.closest("header")).not.toBeNull();
      expect(help).toHaveAttribute("data-icon", "true");
      expect(help).toHaveAttribute("data-neutral", "true");
      cleanup();
    }
  });
  it("a security update's read never holds Today: the page doesn't wait for it, and leaves it to its own part", async () => {
    await open();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
    expect(screen.getByTestId("security-read")).toHaveAttribute("data-uid", "u1");
  });
  it("Try again brings the real row: a new card, as the old one only read its first", async () => {
    checkInError = { message: "boom" };
    const { rerender } = await open();
    checkInError = null;
    rerender(await page());
    expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-first", "false");
  });
});

// Today's reads need only `me`, so they're asked together, not one after another (the Web Dev's
// LCP read, 12 Nov: each one in turn cost a round trip to the database).
describe("Today's reads", () => {
  it("the check-in and the entries are both asked before either answers", async () => {
    const asked: string[] = [];
    const answers: (() => void)[] = [];
    const held = (table: string, value: unknown) => {
      const chain: Record<string, unknown> = {};
      for (const step of ["select", "eq", "order"]) chain[step] = () => chain;
      const wait = () => {
        asked.push(table);
        return new Promise((done) => answers.push(() => done(value)));
      };
      chain.maybeSingle = wait;
      chain.then = (done: (v: unknown) => unknown) => wait().then(done);
      return chain;
    };
    const from = client.from;
    client.from = (table: string) => held(table, table === "check_ins" ? { data: null, error: null } : { data: [], error: null });
    try {
      const rendering = page();
      // Both are asked while neither has answered: one after the other, only check_ins ever would be.
      await vi.waitFor(() => expect([...asked].sort()).toEqual(["check_ins", "entries"]), { timeout: 1000 });
      for (const answer of answers) answer();
      render(await rendering);
      expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-load-failed", "false");
    } finally {
      client.from = from;
    }
  });
});
