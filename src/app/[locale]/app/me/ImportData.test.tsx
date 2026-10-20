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
  importCheckIns.mockReset().mockImplementation(async (days: unknown[]) => ({ status: "ok", written: days.length, skipped: 0 }));
  importEntries.mockReset().mockImplementation(async (entries: unknown[]) => ({ status: "ok", written: entries.length, skipped: 0 }));
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
    importCheckIns.mockResolvedValueOnce({ status: "ok", written: 1, skipped: 1 });
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
    fireEvent.change(screen.getByTestId("import-mood-0"), { target: { value: "5" } });
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

  it("a failed batch: what's written stays, and the error says so", async () => {
    importEntries.mockResolvedValueOnce({ status: "error" });
    renderIt();
    await choose("date,mood,note\n2026-10-01,4,A walk\n");
    fireEvent.click(screen.getByTestId("import-confirm"));
    await settle();
    expect(screen.getByTestId("import-failed")).toHaveTextContent(m.importError);
  });
});
