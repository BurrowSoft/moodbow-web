import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The import flow (1.1 K): choose → preview → Import → done. The file is
// read here only; the server actions are mocked (importActions.test.ts).
const importCheckIns = vi.fn();
const importEntries = vi.fn();
vi.mock("./importActions", () => ({
  importCheckIns: (...a: unknown[]) => importCheckIns(...a),
  importEntries: (...a: unknown[]) => importEntries(...a),
}));
let idCount = 0;
vi.mock("@/lib/import/uuidv5", () => ({ importEntryId: async () => `0b5f2c1e-7d3a-5e8b-9c41-2a6f8e1d3b${String(++idCount).padStart(2, "0")}` }));
vi.mock("@/components/SafetyCard", () => ({ GetHelpNow: ({ testId }: { testId: string }) => <button type="button" data-testid={testId} /> }));
const { ImportData } = await import("./ImportData");
const m = messages.me;

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ImportData uid="u1" today="2026-10-20" dateLocaleTag="en-GB" />
    </NextIntlClientProvider>,
  );
const choose = async (text: string | Uint8Array) => {
  const file = new File([text as BlobPart], "export.csv", { type: "text/csv" });
  await act(async () => {
    fireEvent.change(screen.getByTestId("import-file"), { target: { files: [file] } });
  });
};
const settle = () => act(async () => {});

beforeEach(() => {
  idCount = 0;
  importCheckIns.mockReset().mockImplementation(async (days: { date: string }[]) => ({ status: "ok", written: days.map((d) => d.date), skipped: 0 }));
  importEntries.mockReset().mockImplementation(async (entries: { id: string }[]) => ({ status: "ok", written: entries.map((e) => e.id), skipped: 0 }));
});
afterEach(cleanup);

describe("ImportData", () => {
  it("the title, the privacy line and a labelled file picker; nothing sent on choosing", async () => {
    renderIt();
    expect(screen.getByRole("heading", { name: m.importTitle })).toBeInTheDocument();
    expect(screen.getByText(m.importBody)).toBeInTheDocument();
    expect(screen.getByLabelText(m.importChooseFile)).toHaveAttribute("type", "file");
    await choose("date,mood,note\n2026-10-01,4,A walk\n2026-10-02,3,\n");
    expect(importCheckIns).not.toHaveBeenCalled();
    expect(importEntries).not.toHaveBeenCalled();
  });

  it("preview: days, notes and the range; Import writes check-ins then entries; Done with the count", async () => {
    renderIt();
    await choose("date,mood,note\n2026-10-01,4,A walk\n2026-10-02,3,\n");
    expect(screen.getByTestId("import-summary")).toHaveTextContent("2 days and 1 notes found, from 1 Oct 2026 to 2 Oct 2026.");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(importCheckIns).toHaveBeenCalledWith([
      { date: "2026-10-01", mood: 4 },
      { date: "2026-10-02", mood: 3 },
    ]);
    expect(importEntries).toHaveBeenCalledWith([{ id: expect.any(String), date: "2026-10-01", body: "A walk" }]);
    expect(screen.getByTestId("import-done")).toHaveTextContent("Done. 2 days are in your Timeline.");
  });

  it("days already in Moodbow are reported as skipped", async () => {
    importCheckIns.mockResolvedValueOnce({ status: "ok", written: ["2026-10-01"], skipped: 1 });
    renderIt();
    await choose("date,mood\n2026-10-01,4\n2026-10-02,3\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(screen.getByTestId("import-skipped")).toHaveTextContent("1 days skipped (already in Moodbow).");
  });

  it("an ambiguous file: the DMY/MDY radio, DMY first; switching re-reads the dates", async () => {
    renderIt();
    await choose("date,mood\n03/10/2026,3\n05/09/2026,4\n");
    expect(screen.getByTestId("import-date-dmy")).toBeChecked();
    expect(screen.getByTestId("import-summary")).toHaveTextContent("from 5 Sept 2026 to 3 Oct 2026");
    fireEvent.click(screen.getByTestId("import-date-mdy"));
    expect(screen.getByTestId("import-summary")).toHaveTextContent("from 10 Mar 2026 to 9 May 2026");
  });

  it("custom Daylio moods: matched to a level before importing (H2)", async () => {
    renderIt();
    await choose("full_date,date,weekday,time,mood,activities,note_title,note\n2026-10-10,x,x,9:00 am,ecstatic,,,\n");
    expect(screen.getByTestId("import-moods")).toHaveTextContent(m.importMapMoods);
    // Nothing chosen yet: "Choose a mood…", and Import disabled (reviewer #92 B4).
    expect(screen.getByTestId("import-mood-0")).toHaveValue("");
    expect(screen.getByRole("option", { name: m.importMapChoose })).toBeDisabled();
    expect(screen.getByTestId("import-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("import-mood-0"), { target: { value: "5" } });
    expect(screen.getByTestId("import-confirm")).toBeEnabled();
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(importCheckIns).toHaveBeenCalledWith([{ date: "2026-10-10", mood: 5 }]);
  });

  it("an unreadable file (another encoding, no header): importError, nothing written", async () => {
    renderIt();
    await choose(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00]));
    expect(screen.getByTestId("import-error")).toHaveTextContent(m.importError);
    await choose("2026-10-01,3\n2026-10-02,4\n");
    expect(screen.getByTestId("import-error")).toBeInTheDocument();
    expect(importCheckIns).not.toHaveBeenCalled();
  });

  it("a crisis phrase in an imported note: one quiet line at the end with Get help, no card per note", async () => {
    renderIt();
    await choose("date,mood,note\n2026-10-01,2,Some days I want to die.\n2026-10-02,3,A walk\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(screen.getByTestId("import-crisis")).toHaveTextContent(m.importCrisisLine);
    expect(screen.getAllByTestId("import-get-help")).toHaveLength(1);
  });

  it("Cancel at the preview writes nothing and the picker can be used again", async () => {
    renderIt();
    await choose("date,mood\n2026-10-01,4\n");
    fireEvent.click(screen.getByTestId("import-cancel"));
    expect(screen.queryByTestId("import-preview")).toBeNull();
    expect(importCheckIns).not.toHaveBeenCalled();
  });

  it("a failed batch: what's written stays, and it says so: the same file again finishes (never 'couldn't read this file')", async () => {
    importEntries.mockResolvedValueOnce({ status: "error" });
    renderIt();
    await choose("date,mood,note\n2026-10-01,4,A walk\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    const failed = screen.getByTestId("import-failed");
    expect(failed).toHaveTextContent(m.importStopped);
    expect(failed).not.toHaveTextContent(m.importError);
    expect(screen.queryByTestId("import-offline")).toBeNull();
  });

  it("stopped part-way while offline: errOffline first, then importStopped", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    importEntries.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderIt();
    await choose("date,mood,note\n2026-10-01,4,A walk\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    const failed = screen.getByTestId("import-failed");
    expect(failed.textContent).toBe(`${messages.ai.errOffline}${m.importStopped}`);
    delete (navigator as { onLine?: boolean }).onLine;
  });
  it("\"Don't import\" is an explicit choice too: Import enabled, and that day gets no mood", async () => {
    renderIt();
    await choose("full_date,date,weekday,time,mood,activities,note_title,note\n2026-10-10,x,x,9:00 am,ecstatic,,,A note\n");
    fireEvent.change(screen.getByTestId("import-mood-0"), { target: { value: "skip" } });
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(importCheckIns).not.toHaveBeenCalled();
    expect(importEntries).toHaveBeenCalledTimes(1);
  });

  it("a double click starts one import (reviewer #92 B1)", async () => {
    let release!: () => void;
    importCheckIns.mockImplementationOnce(() => new Promise((r) => (release = () => r({ status: "ok", written: ["2026-10-01"], skipped: 0 }))));
    renderIt();
    await choose("date,mood\n2026-10-01,4\n");
    const confirm = screen.getByTestId("import-confirm");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await settle();
    await act(async () => release());
    expect(importCheckIns).toHaveBeenCalledTimes(1);
  });

  it("while importing, leaving the page asks first", async () => {
    let release!: () => void;
    importCheckIns.mockImplementationOnce(() => new Promise((r) => (release = () => r({ status: "ok", written: ["2026-10-01"], skipped: 0 }))));
    renderIt();
    await choose("date,mood\n2026-10-01,4\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => release());
  });

  it("over 10 MB: refused before the file is read (reviewer #92 B2)", async () => {
    renderIt();
    const file = new File(["date,mood\n"], "big.csv", { type: "text/csv" });
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    await act(async () => {
      fireEvent.change(screen.getByTestId("import-file"), { target: { files: [file] } });
    });
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByTestId("import-error")).toHaveTextContent(m.importError);
  });

  it("an unterminated quote: importError (reviewer #92 B3)", async () => {
    renderIt();
    await choose('date,mood,note\n2026-10-01,3,"never closed\n');
    expect(screen.getByTestId("import-error")).toBeInTheDocument();
  });

  it("stopped part-way: the crisis line still shows if a note that was written matched (reviewer #92 B5)", async () => {
    importEntries.mockImplementationOnce(async (entries: { id: string }[]) => ({ status: "ok", written: entries.map((e) => e.id), skipped: 0 }));
    const notes = Array.from({ length: 101 }, (_, i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")},3,${i === 0 ? "Some days I want to die." : "A walk"}`);
    importEntries.mockResolvedValueOnce({ status: "error" });
    renderIt();
    await choose(["date,mood,note", ...notes].join("\n"));
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(screen.getByTestId("import-failed")).toBeInTheDocument();
    expect(screen.getByTestId("import-crisis")).toHaveTextContent(m.importCrisisLine);
  });

  it("only notes already there are skipped: the crisis line counts only what was written", async () => {
    importEntries.mockResolvedValueOnce({ status: "ok", written: [], skipped: 1 });
    importCheckIns.mockResolvedValueOnce({ status: "ok", written: [], skipped: 1 });
    renderIt();
    await choose("date,mood,note\n2026-10-01,2,Some days I want to die.\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(screen.queryByTestId("import-crisis")).toBeNull();
    expect(screen.getByTestId("import-done")).toHaveTextContent("Done. 0 days are in your Timeline.");
    expect(screen.getByTestId("import-skipped")).toHaveTextContent("1 days skipped (already in Moodbow).");
  });

  it("after a part-way stop, days not reached yet aren't called already in Moodbow (reviewer #92)", async () => {
    importCheckIns.mockResolvedValueOnce({ status: "ok", written: [], skipped: 1 });
    importEntries.mockResolvedValueOnce({ status: "error" });
    renderIt();
    await choose("date,mood,note\n2026-10-01,3,\n2026-10-02,,A note\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(screen.getByTestId("import-failed")).toBeInTheDocument();
    expect(screen.getByTestId("import-skipped")).toHaveTextContent("1 days skipped (already in Moodbow).");
  });

  it("a notes-only file counts its days (M-a)", async () => {
    renderIt();
    await choose("date,mood,note\n2026-10-01,,A walk\n2026-10-02,,Tea\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(importCheckIns).not.toHaveBeenCalled();
    expect(screen.getByTestId("import-done")).toHaveTextContent("Done. 2 days are in your Timeline.");
  });
});
