import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { readReflections, type ReflectionRow } from "@/lib/journal/reflections";

// The real words (messages/en.json) on the server side.
vi.mock("next-intl/server", async () => {
  const all = (await import("@/messages/en.json")).default as unknown as Record<string, Record<string, string>>;
  return { getTranslations: async (ns: string) => (key: string) => all[ns][key] };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The invitation has its own test (AiInvite.test).
vi.mock("./AiInvite", () => ({ AiInvite: () => <section data-testid="insights-ai-invite" /> }));
const { AiPane, ReflectionList, WeekPlusPrompt } = await import("./AiPane");
const m = messages.ai;

const row = (i: number, line: string | null = `Line ${i}.`): ReflectionRow => ({ id: `r${i}`, entryId: `e${i}`, entryDate: `2026-11-1${i}`, line });
const on = async (over: Partial<Parameters<typeof AiPane>[0] & { state: "on" }> = {}) =>
  render(await AiPane({ state: "on", reflections: { rows: [row(3), row(2), row(1)], more: false }, dateLocaleTag: "en-GB", week: <section data-testid="the-week" />, pastReports: false, ...over }));
afterEach(cleanup);

describe("Insights → AI (decision 258)", () => {
  it("AI off for this person: the invitation, and nothing else", async () => {
    render(await AiPane({ state: "off" }));
    expect(screen.getByTestId("insights-ai-invite")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-reflections")).toBeNull();
    expect(screen.queryByTestId("insights-ai-settings")).toBeNull();
  });

  it("AI on: Your reflections first, then Your week, then the AI settings link to Me → AI", async () => {
    await on();
    const reflections = screen.getByTestId("insights-reflections");
    const week = screen.getByTestId("the-week");
    const settings = screen.getByTestId("insights-ai-settings");
    expect(within(reflections).getByRole("heading", { level: 2 })).toHaveTextContent(m.reflectionsTitle);
    expect(reflections.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(week.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settings).toHaveAttribute("href", "/app/me#me-ai");
    expect(settings).toHaveTextContent(m.aiSettingsLink);
  });

  it("each row one link to its entry (Back comes here), the entry's date read before the first line", async () => {
    await on();
    const links = within(screen.getByTestId("insights-reflections-list")).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/app/entries/e3?from=%2Fapp%2Finsights%3Fview%3Dai");
    const [date, line] = [within(links[0]).getByTestId("insights-reflection-date"), within(links[0]).getByTestId("insights-reflection-line")];
    expect(date.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(date).toHaveTextContent(/13 November 2026/);
    expect(line).toHaveTextContent("Line 3.");
    expect(line).toHaveClass("line-clamp-2");
    // Three and no more: no See all.
    expect(screen.queryByTestId("insights-reflections-see-all")).toBeNull();
  });

  it("more than three: See all, to the whole list", async () => {
    await on({ reflections: { rows: [row(3), row(2), row(1)], more: true } });
    expect(screen.getByTestId("insights-reflections-see-all")).toHaveAttribute("href", "/app/insights/reflections");
    expect(screen.getByTestId("insights-reflections-see-all")).toHaveTextContent(m.reflectionsSeeAll);
  });

  it("none yet: the empty line; a read that failed says so", async () => {
    await on({ reflections: { rows: [], more: false } });
    expect(screen.getByTestId("insights-reflections-empty")).toHaveTextContent(m.reflectionsEmpty);
    cleanup();
    await on({ reflections: null });
    expect(screen.getByTestId("insights-reflections-error")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.queryByTestId("insights-reflections-empty")).toBeNull();
  });

  it("a crisis reply: its row is the date and the neutral word, and its text is nowhere on the page, words, labels or attributes (the Reviewer)", async () => {
    // The Web Tester's seeded row, through the real read.
    const seeded = 'SEEDED-CRISIS-MARKER-7Q. Please tap "Want to talk to someone?" now.';
    const fake = {
      from: (table: string) => {
        const c: Record<string, unknown> = {};
        for (const s of ["select", "order", "limit", "in"]) c[s] = () => c;
        c.then = (done: (v: unknown) => unknown) =>
          Promise.resolve(
            table === "ai_reflections"
              ? { data: [{ id: "r1", entry_id: "e1", body: seeded, created_at: "2026-11-25T00:00:00Z" }, { id: "r2", entry_id: "e2", body: "A gentle day.", created_at: "2026-11-24T00:00:00Z" }], error: null }
              : { data: [{ id: "e1", entry_date: "2026-11-25" }, { id: "e2", entry_date: "2026-11-24" }], error: null },
          ).then(done);
        return c;
      },
    };
    const reflections = await readReflections(fake as never, 3);
    const { container } = await on({ reflections });
    const rows = screen.getAllByTestId("insights-reflection");
    expect(within(rows[0]).getByTestId("insights-reflection-line")).toHaveTextContent(m.reflectionsRowCrisis);
    expect(within(rows[0]).getByTestId("insights-reflection-date")).toHaveTextContent(/25 November 2026/);
    expect(within(rows[1]).getByTestId("insights-reflection-line")).toHaveTextContent("A gentle day.");
    for (const text of ["SEEDED-CRISIS-MARKER-7Q", "talk to someone", "Please tap"]) expect(container.innerHTML).not.toContain(text);
  });

  it("past reports: the link once there's one (with Plus), to Me's list", async () => {
    await on({ pastReports: true });
    expect(screen.getByTestId("insights-past-reports")).toHaveAttribute("href", "/app/me/reports");
    expect(screen.getByTestId("insights-past-reports")).toHaveTextContent(messages.me.pastReports);
    cleanup();
    await on({ pastReports: false });
    expect(screen.queryByTestId("insights-past-reports")).toBeNull();
  });

  it("See all's rows carry their place, for Show more's landing, and go Back to See all", async () => {
    render(await ReflectionList({ rows: [row(1), row(2)], dateLocaleTag: "en-GB", origin: "/app/insights/reflections", first: 20 }));
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.id)).toEqual(["reflection-20", "reflection-21"]);
    expect(links[0]).toHaveAttribute("href", "/app/entries/e1?from=%2Fapp%2Finsights%2Freflections");
  });
});

describe("Your week without Plus (UX, 25 Nov)", () => {
  it("the report's name, Example, its one line and See Plus", async () => {
    render(await WeekPlusPrompt());
    const card = screen.getByTestId("weekly-report-plus");
    expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(m.reportWeekly);
    expect(card).toHaveTextContent(messages.plus.exampleLabel);
    expect(card).toHaveTextContent(m.reportPlusLine);
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/app/me/plus");
    expect(within(card).getByRole("link")).toHaveTextContent(messages.plus.seePlus);
  });
});
