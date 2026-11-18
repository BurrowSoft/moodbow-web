import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { RoutineItemRow } from "@/lib/journal/routine";

const add = vi.fn();
const rename = vi.fn();
const remove = vi.fn();
const move = vi.fn();
const optIn = vi.fn();
vi.mock("./actions", () => ({
  addRoutineItem: (...a: unknown[]) => add(...a),
  renameRoutineItem: (...a: unknown[]) => rename(...a),
  removeRoutineItem: (...a: unknown[]) => remove(...a),
  moveRoutineItem: (...a: unknown[]) => move(...a),
  setRoutineInAppointment: (...a: unknown[]) => optIn(...a),
}));
const flags = { crisis: false };
vi.mock("@/lib/safety/crisis", () => ({ flagsCrisis: () => flags.crisis }));
vi.mock("@/components/SafetyCard", () => ({ SafetyCard: () => <div data-testid="safety-card" /> }));
const { RoutineEditor } = await import("./RoutineEditor");

const m = messages.routine;
const items = (...names: string[]): RoutineItemRow[] => names.map((name, position) => ({ id: `i${position}`, name, position, in_appointment: false, started_on: "2026-11-01" }));
const ok = (list: RoutineItemRow[]) => Promise.resolve({ status: "ok", items: list });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  flags.crisis = false;
});

const open = (initial: RoutineItemRow[], appointment = true) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RoutineEditor initial={initial} appointment={appointment} />
    </NextIntlClientProvider>,
  );

describe("RoutineEditor (1.4 F, board 29)", () => {
  it("empty: the add field with the app's hint and a 0/40 counter", () => {
    open([]);
    expect(screen.getByTestId("routine-new")).toHaveAttribute("placeholder", m.addHint);
    expect(screen.getByTestId("routine-new-count")).toHaveTextContent("0/40");
    expect(screen.queryByTestId("routine-list")).toBeNull();
  });

  it("Add saves it and shows the list the server sends back", async () => {
    add.mockReturnValueOnce(ok(items("Morning meds")));
    open([]);
    fireEvent.change(screen.getByTestId("routine-new"), { target: { value: "Morning meds" } });
    await act(async () => fireEvent.click(screen.getByTestId("routine-add")));
    expect(add).toHaveBeenCalledWith("Morning meds");
    expect(screen.getAllByTestId("routine-name").map((n) => n.textContent)).toEqual(["Morning meds"]);
    expect(screen.getByTestId("routine-new")).toHaveValue("");
  });

  it("the field stops at 40 (code points), with no error text", () => {
    open([]);
    fireEvent.change(screen.getByTestId("routine-new"), { target: { value: "💊".repeat(45) } });
    expect(screen.getByTestId("routine-new")).toHaveValue("💊".repeat(40));
    expect(screen.getByTestId("routine-new-count")).toHaveTextContent("40/40");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a same name in another case: the app's line, nothing sent", async () => {
    open(items("Walk"));
    fireEvent.change(screen.getByTestId("routine-new"), { target: { value: " WALK " } });
    await act(async () => fireEvent.click(screen.getByTestId("routine-add")));
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByTestId("routine-duplicate")).toHaveTextContent(m.duplicate);
  });

  it("at 3: the limit line instead of the field", () => {
    open(items("a", "b", "c"));
    expect(screen.queryByTestId("routine-new")).toBeNull();
    expect(screen.getByTestId("routine-full")).toHaveTextContent(m.full);
  });

  it("⋯ opens the row's actions; its name says whose", () => {
    open(items("Morning meds", "Walk"));
    const [first] = screen.getAllByTestId("routine-more");
    expect(first).toHaveAccessibleName("Options for Morning meds");
    expect(first).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("routine-edit")).toBeInTheDocument();
    expect(screen.queryByTestId("routine-up")).toBeNull();
    expect(screen.getByTestId("routine-down")).toBeInTheDocument();
    expect(screen.getByTestId("routine-remove")).toHaveTextContent(m.deleteConfirm);
  });

  it("Remove asks first, with the item's name; Cancel sends nothing", async () => {
    open(items("Morning meds"));
    fireEvent.click(screen.getByTestId("routine-more"));
    fireEvent.click(screen.getByTestId("routine-remove"));
    const dialog = screen.getByTestId("routine-remove-dialog");
    expect(dialog).toHaveTextContent("Remove Morning meds?");
    expect(dialog).toHaveTextContent(m.deleteBody);
    fireEvent.click(screen.getByTestId("routine-remove-cancel"));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("routine-more"));
    fireEvent.click(screen.getByTestId("routine-remove"));
    remove.mockReturnValueOnce(ok([]));
    await act(async () => fireEvent.click(screen.getByTestId("routine-remove-confirm")));
    expect(remove).toHaveBeenCalledWith("i0");
    expect(screen.queryByTestId("routine-list")).toBeNull();
  });

  it("rename and move go to the server", async () => {
    open(items("Walk", "Meds"));
    fireEvent.click(screen.getAllByTestId("routine-more")[0]);
    fireEvent.click(screen.getByTestId("routine-edit"));
    fireEvent.change(screen.getByTestId("routine-edit-name"), { target: { value: "Walk outside" } });
    rename.mockReturnValueOnce(ok(items("Walk outside", "Meds")));
    await act(async () => fireEvent.click(screen.getByTestId("routine-save")));
    expect(rename).toHaveBeenCalledWith("i0", "Walk outside");
    fireEvent.click(screen.getAllByTestId("routine-more")[0]);
    move.mockReturnValueOnce(ok(items("Meds", "Walk outside")));
    await act(async () => fireEvent.click(screen.getByTestId("routine-down")));
    expect(move).toHaveBeenCalledWith("i0", 1);
  });

  it("the appointment switch per item, only where For my appointment is on", async () => {
    open(items("Meds"));
    const sw = screen.getByTestId("routine-in-appointment");
    expect(sw).toHaveAttribute("role", "switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    optIn.mockReturnValueOnce(ok([{ ...items("Meds")[0], in_appointment: true }]));
    await act(async () => fireEvent.click(sw));
    expect(optIn).toHaveBeenCalledWith("i0", true);
    expect(screen.getByTestId("routine-in-appointment")).toHaveAttribute("aria-checked", "true");
    cleanup();
    open(items("Meds"), false);
    expect(screen.queryByTestId("routine-in-appointment")).toBeNull();
  });

  it("a name on the crisis list offers help and still saves (Q3)", async () => {
    flags.crisis = true;
    add.mockReturnValueOnce(ok(items("x")));
    open([]);
    fireEvent.change(screen.getByTestId("routine-new"), { target: { value: "x" } });
    await act(async () => fireEvent.click(screen.getByTestId("routine-add")));
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(add).toHaveBeenCalled();
  });

  it("a failed save says so; the list stays", async () => {
    add.mockReturnValueOnce(Promise.resolve({ status: "error", error: "failed" }));
    open(items("Walk"));
    fireEvent.change(screen.getByTestId("routine-new"), { target: { value: "Meds" } });
    await act(async () => fireEvent.click(screen.getByTestId("routine-add")));
    expect(screen.getByTestId("routine-failed")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getAllByTestId("routine-name")).toHaveLength(1);
  });
});
