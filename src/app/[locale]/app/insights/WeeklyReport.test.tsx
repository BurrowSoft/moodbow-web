import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const requestWeeklyReport = vi.fn();
const deleteWeeklyReport = vi.fn();
vi.mock("./reportActions", () => ({
  requestWeeklyReport: (...a: unknown[]) => requestWeeklyReport(...a),
  deleteWeeklyReport: (...a: unknown[]) => deleteWeeklyReport(...a),
}));
const { WeeklyReport, weekRange } = await import("./WeeklyReport");
const m = messages.ai;

const SECTIONS = { changed: "You slept about an hour more.", went_well: "The Tuesday walk.", notice: "Busier days came after short nights.", idea: "An earlier night before Thursday." };
const report = (over: object = {}) => ({ id: "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70", week_start: "2026-10-12", body: { sections: SECTIONS }, tier: "full" as const, created_at: "2026-10-20T09:00:00Z", ...over });
const ok = (over: object = {}, balance: number | null = 600) => ({ status: "ok", report: report(over), balance });
const renderIt = (initial: ReturnType<typeof report> | null = null, balance = 600) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WeeklyReport initial={initial} weekStart="2026-10-12" dateLocaleTag="en-GB" balance={balance} />
    </NextIntlClientProvider>,
  );
const keys = () => requestWeeklyReport.mock.calls.map((c) => c[0] as string);
const settle = () => act(async () => {});

beforeEach(() => {
  requestWeeklyReport.mockReset();
  deleteWeeklyReport.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("weekRange", () => {
  it("Monday to Sunday as one range in the region's format", () => {
    expect(weekRange("2026-10-12", "en-GB")).toMatch(/^12\s*–\s*18 Oct$/);
    expect(weekRange("2026-12-28", "en-GB")).toMatch(/28 Dec.*3 Jan/);
  });
});

describe("WeeklyReport (1.1 D)", () => {
  it("no report yet: the title, last week's range and See my week", () => {
    renderIt();
    expect(screen.getByRole("heading", { name: m.reportWeekly })).toBeInTheDocument();
    expect(screen.getByTestId("weekly-report-range")).toHaveTextContent(/12\s*–\s*18 Oct/);
    expect(screen.getByTestId("weekly-report-button")).toHaveTextContent(m.reportButton);
  });

  it("tap: the loading card, then the four headed sections in the voice card and 'Your week is ready'", async () => {
    let answer!: (v: unknown) => void;
    requestWeeklyReport.mockReturnValueOnce(new Promise((r) => (answer = r)));
    renderIt();
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    expect(screen.getByTestId("weekly-report-button")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("weekly-report-loading")).toHaveTextContent(m.reportLoading);
    await act(async () => answer(ok()));
    const result = screen.getByTestId("weekly-report-result");
    for (const [field, heading] of [["changed", m.reportChanged], ["went_well", m.reportWentWell], ["notice", m.reportNotice], ["idea", m.reportIdea]] as const) {
      expect(screen.getByTestId(`weekly-report-${field}`)).toHaveTextContent(heading);
      expect(screen.getByTestId(`weekly-report-${field}`)).toHaveTextContent(SECTIONS[field]);
    }
    expect(result).toHaveTextContent(messages.app.appName);
    expect(screen.getByTestId("weekly-report-status")).toHaveTextContent(m.reportReady);
    expect(screen.queryByTestId("weekly-report-button")).toBeNull();
    expect(keys()).toHaveLength(1);
  });

  it("no idea: no 'One small idea'; Lite: the badge", () => {
    const { idea: _idea, ...three } = SECTIONS;
    void _idea;
    renderIt(report({ body: { sections: three }, tier: "lite" }));
    expect(screen.queryByTestId("weekly-report-idea")).toBeNull();
    expect(screen.queryByText(m.reportIdea)).toBeNull();
    expect(screen.getByTestId("weekly-report-lite")).toHaveTextContent(m.reflectLiteBadge);
  });

  it("a crisis week: only the text and the Get help button, no headings (decisions 124, 157)", () => {
    renderIt(report({ body: { crisis: "This week sounds very hard. Please reach out now." } }));
    expect(screen.getByTestId("weekly-report-crisis")).toHaveTextContent("Please reach out now.");
    expect(screen.getByTestId("weekly-report-get-help")).toBeInTheDocument();
    for (const h of [m.reportChanged, m.reportWentWell, m.reportNotice, m.reportIdea]) expect(screen.queryByText(h)).toBeNull();
  });

  it("fewer than 3 check-ins (422 not_enough): the note replaces the button", async () => {
    requestWeeklyReport.mockResolvedValueOnce({ status: "error", message: "reportNotEnough" });
    renderIt();
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    await settle();
    expect(screen.getByTestId("weekly-report-not-enough")).toHaveTextContent(m.reportNotEnough);
    expect(screen.queryByTestId("weekly-report-button")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("report_failed: the report error; the next tap is a new key", async () => {
    requestWeeklyReport.mockResolvedValueOnce({ status: "error", message: "reportError" }).mockResolvedValueOnce(ok());
    renderIt();
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    await settle();
    expect(screen.getByTestId("weekly-report-error")).toHaveTextContent(m.reportError);
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    await settle();
    expect(new Set(keys()).size).toBe(2);
  });

  it("in_progress: asks again with the same key after ~2 s", async () => {
    vi.useFakeTimers();
    requestWeeklyReport.mockResolvedValueOnce({ status: "in_progress" }).mockResolvedValueOnce(ok());
    renderIt();
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    await settle();
    expect(keys()).toHaveLength(2);
    expect(keys()[0]).toBe(keys()[1]);
    expect(screen.getByTestId("weekly-report-result")).toBeInTheDocument();
  });

  it("no answer: errOffline, and Try again resends the same tap", async () => {
    requestWeeklyReport.mockResolvedValueOnce({ status: "no_answer" }).mockResolvedValueOnce(ok());
    renderIt();
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    await settle();
    expect(screen.getByTestId("weekly-report-error")).toHaveTextContent(m.errOffline);
    fireEvent.click(screen.getByTestId("weekly-report-retry"));
    await settle();
    expect(keys()[0]).toBe(keys()[1]);
    expect(screen.getByTestId("weekly-report-result")).toBeInTheDocument();
  });

  it("AI off for everyone (ai_disabled): the card goes away", async () => {
    requestWeeklyReport.mockResolvedValueOnce({ status: "hidden" });
    renderIt();
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    await settle();
    expect(screen.queryByTestId("weekly-report")).toBeNull();
  });

  it("Delete report: confirm, delete by id, See my week is back with 'Report deleted'", async () => {
    renderIt(report());
    fireEvent.click(screen.getByTestId("weekly-report-delete"));
    const dialog = screen.getByTestId("weekly-report-delete-dialog");
    expect(dialog).toHaveTextContent(m.reportDeleteConfirmTitle);
    expect(dialog).toHaveTextContent(m.reportDeleteConfirmBody);
    fireEvent.click(screen.getByTestId("weekly-report-delete-confirm"));
    await settle();
    expect(deleteWeeklyReport).toHaveBeenCalledWith("0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70");
    expect(screen.getByTestId("weekly-report-button")).toBeInTheDocument();
    expect(screen.getByTestId("weekly-report-status")).toHaveTextContent(m.reportDeleted);
  });

  it("the credits ran out with this report: the one-time notice", async () => {
    requestWeeklyReport.mockResolvedValueOnce(ok({}, 0));
    renderIt(null, 5);
    fireEvent.click(screen.getByTestId("weekly-report-button"));
    await settle();
    expect(screen.getByTestId("weekly-report-credits-out")).toHaveTextContent(m.creditsOut);
  });
});
