import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Today always keeps check-in and Write, with errors beside them (specs/next-release.md).
let checkInError: unknown = null;
let entriesError: unknown = null;
// Your week's own reads (last week's check-ins and moments: .gte/.lte, no .maybeSingle).
let weekError: unknown = null;
let momentsError: unknown = null;
const query = (table: string) => {
  let week = false;
  const chain: Record<string, unknown> = {};
  for (const step of ["select", "eq", "order", "lte"]) chain[step] = () => chain;
  chain.gte = () => {
    week = true;
    return chain;
  };
  const result = () =>
    table === "check_ins"
      ? week
        ? { data: weekError ? null : [], error: weekError }
        : { data: null, error: checkInError }
      : week
        ? { data: momentsError ? null : [], error: momentsError }
        : { data: entriesError ? null : [], error: entriesError };
  chain.maybeSingle = async () => result();
  chain.then = (done: (value: unknown) => unknown) => Promise.resolve(result()).then(done);
  return chain;
};
const client = {
  // A read that never answers: the page must not wait for it.
  rpc: vi.fn(() => new Promise(() => {})),
  from: (table: string) => query(table),
};
// The gates: hidden unless a test opens one (vitest's NODE_ENV hides drafts anyway).
let gates: Record<string, "live" | "draft" | "hidden"> = {};
vi.mock("@/lib/conditions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/conditions")>()), pageGate: (id: string) => gates[id] ?? "hidden" }));
let plusRead: () => Promise<unknown> = async () => null;
const plusAsked = vi.fn();
vi.mock("@/lib/plus/page", () => ({
  readPlusPage: () => {
    plusAsked();
    return plusRead();
  },
}));
const yourWeekSpy = vi.fn();
vi.mock("@/lib/journal/yourWeek", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/journal/yourWeek")>();
  return { ...real, yourWeek: (...args: unknown[]) => yourWeekSpy(...args) };
});
vi.mock("./insights/YourWeekCard", () => ({ YourWeekCard: ({ week }: { week: { kind: string } }) => <div data-testid="your-week" data-kind={week.kind} /> }));
vi.mock("./TodayCards", () => ({ SetupLaterCard: () => null, TodayPlusCard: () => <div data-testid="today-plus-card" /> }));
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
  weekError = null;
  momentsError = null;
  gates = {};
  plusRead = async () => null;
  plusAsked.mockClear();
  yourWeekSpy.mockReset();
  yourWeekSpy.mockReturnValue({ kind: "pattern" });
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

// Your week on Today (#316) and the app's regression (UX, 14 Nov): one read failing, or being slow,
// never costs the check-in card or Write.
describe("Today with Your week and Plus: each part stands alone", () => {
  beforeEach(() => {
    gates = { "your-week-live": "draft", plus: "draft" };
  });
  it("(a) today's check-in couldn't be read, last week could: the card with its error, and Your week", async () => {
    checkInError = { message: "boom" };
    await open();
    expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-load-failed", "true");
    expect(screen.getByTestId("your-week")).toBeInTheDocument();
    expect(screen.getByTestId("today-write")).toBeInTheDocument();
  });
  it("(b) last week couldn't be read, today's check-in could: the card as usual, no Your week", async () => {
    weekError = { message: "boom" };
    await open();
    expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-load-failed", "false");
    expect(screen.queryByTestId("your-week")).toBeNull();
    expect(yourWeekSpy).not.toHaveBeenCalled();
  });
  it("moments couldn't be read: Your week still shows (its help comes from check-ins), without moments", async () => {
    momentsError = { message: "boom" };
    await open();
    expect(screen.getByTestId("your-week")).toBeInTheDocument();
    expect(yourWeekSpy.mock.calls[0][2]).toEqual([]);
  });
  it("(c) every read is asked in one round: today's two, last week's two and Plus, before any answers", async () => {
    const asked: string[] = [];
    const answers: (() => void)[] = [];
    const held = (table: string) => {
      let week = false;
      const chain: Record<string, unknown> = {};
      for (const step of ["select", "eq", "order", "lte"]) chain[step] = () => chain;
      chain.gte = () => {
        week = true;
        return chain;
      };
      const wait = () => {
        asked.push(`${table}${week ? " (week)" : ""}`);
        return new Promise((done) => answers.push(() => done({ data: table === "check_ins" && !week ? null : [], error: null })));
      };
      chain.maybeSingle = wait;
      chain.then = (done: (v: unknown) => unknown) => wait().then(done);
      return chain;
    };
    const from = client.from;
    client.from = held;
    try {
      const rendering = page();
      await vi.waitFor(() => expect([...asked].sort()).toEqual(["check_ins", "check_ins (week)", "entries", "entries (week)"]), { timeout: 1000 });
      expect(plusAsked).toHaveBeenCalledTimes(1);
      for (const answer of answers) answer();
      render(await rendering);
      expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-load-failed", "false");
      expect(screen.getByTestId("your-week")).toBeInTheDocument();
    } finally {
      client.from = from;
    }
  });
  it("(d) a week it can't work out (yourWeek throws): no card, the check-in and Write stay", async () => {
    yourWeekSpy.mockImplementation(() => {
      throw new Error("odd data");
    });
    await open();
    expect(screen.queryByTestId("your-week")).toBeNull();
    expect(screen.getByTestId("checkin-card")).toHaveAttribute("data-load-failed", "false");
    expect(screen.getByTestId("today-write")).toBeInTheDocument();
  });
  it("a Plus read that never answers (a slow Stripe): Today renders after 10 s without the Plus card", async () => {
    vi.useFakeTimers();
    try {
      plusRead = () => new Promise(() => {});
      const rendering = page();
      await vi.advanceTimersByTimeAsync(10_000);
      render(await rendering);
      expect(screen.getByTestId("checkin-card")).toBeInTheDocument();
      expect(screen.getByTestId("your-week")).toBeInTheDocument();
      expect(screen.queryByTestId("today-plus-card")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("Plus answering in time: the card shows for someone free", async () => {
    plusRead = async () => ({ view: { kind: "free", trial: false }, price: "US$59.99", offer: null });
    await open();
    expect(screen.getByTestId("today-plus-card")).toBeInTheDocument();
  });
});
