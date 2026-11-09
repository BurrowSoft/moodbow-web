import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { ToolboxItem } from "@/lib/journal/toolbox";

const add = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const move = vi.fn();
vi.mock("./actions", () => ({
  addToolboxItem: (...a: unknown[]) => add(...a),
  updateToolboxItem: (...a: unknown[]) => update(...a),
  deleteToolboxItem: (...a: unknown[]) => remove(...a),
  moveToolboxItem: (...a: unknown[]) => move(...a),
}));
const { ToolboxEditor } = await import("./ToolboxEditor");

const m = messages.toolbox;
const items = (...texts: string[]): ToolboxItem[] => texts.map((text, position) => ({ id: `i${position}`, text, position }));
const ok = (list: ToolboxItem[]) => Promise.resolve({ status: "ok", items: list });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = (initial: ToolboxItem[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ToolboxEditor initial={initial} />
    </NextIntlClientProvider>,
  );

describe("ToolboxEditor", () => {
  it("empty: says what it's for and that only they see it", () => {
    open([]);
    expect(screen.getByTestId("toolbox-empty")).toHaveTextContent(m.empty);
    expect(screen.getByTestId("toolbox-new")).toHaveAttribute("placeholder", m.placeholder);
  });

  it("Add saves it, and shows the list the server sends back", async () => {
    add.mockReturnValueOnce(ok(items("Walk round the block")));
    open([]);
    fireEvent.change(screen.getByTestId("toolbox-new"), { target: { value: "Walk round the block" } });
    await act(async () => fireEvent.click(screen.getByTestId("toolbox-add")));
    expect(add).toHaveBeenCalledWith("Walk round the block");
    expect(screen.getAllByTestId("toolbox-item")).toHaveLength(1);
    expect(screen.getByTestId("toolbox-new")).toHaveValue("");
  });

  it("over 120 characters: says so, and Add waits", () => {
    open([]);
    fireEvent.change(screen.getByTestId("toolbox-new"), { target: { value: "a".repeat(121) } });
    expect(screen.getByTestId("toolbox-too-long")).toHaveTextContent(m.limitLength);
    expect(screen.getByTestId("toolbox-add")).toBeDisabled();
    expect(screen.getByTestId("toolbox-new")).toHaveAttribute("aria-invalid", "true");
  });

  it("20 already: no field to add, the limit said instead", () => {
    open(items(...Array.from({ length: 20 }, (_, i) => `Thing ${i}`)));
    expect(screen.queryByTestId("toolbox-new")).toBeNull();
    expect(screen.getByTestId("toolbox-full")).toHaveTextContent(m.limitCount);
  });

  it("the server says full (another tab got there first): the limit, not a generic error", async () => {
    add.mockReturnValueOnce(Promise.resolve({ status: "error", error: "full" }));
    open([]);
    fireEvent.change(screen.getByTestId("toolbox-new"), { target: { value: "One more" } });
    await act(async () => fireEvent.click(screen.getByTestId("toolbox-add")));
    expect(screen.getByTestId("toolbox-full-error")).toHaveTextContent(m.limitCount);
    expect(screen.getByTestId("toolbox-new")).toHaveValue("One more");
  });

  it("Delete says Deleted. with Undo, which puts it back where it was", async () => {
    remove.mockReturnValueOnce(ok(items("Text Sam")));
    add.mockReturnValueOnce(ok(items("Walk", "Text Sam")));
    open(items("Walk", "Text Sam"));
    await act(async () => fireEvent.click(screen.getAllByTestId("toolbox-delete")[0]));
    expect(remove).toHaveBeenCalledWith("i0");
    expect(screen.getByTestId("toolbox-deleted")).toHaveTextContent(m.deleted);
    expect(screen.getByTestId("toolbox-new")).toHaveFocus();
    await act(async () => fireEvent.click(screen.getByTestId("toolbox-undo")));
    expect(add).toHaveBeenCalledWith("Walk", 0);
    expect(screen.queryByTestId("toolbox-deleted")).toBeNull();
    expect(screen.getAllByTestId("toolbox-item")).toHaveLength(2);
  });

  it("Move up and Move down, by name; none past either end", async () => {
    move.mockReturnValueOnce(ok(items("Text Sam", "Walk")));
    open(items("Walk", "Text Sam"));
    const [first, second] = screen.getAllByTestId("toolbox-item");
    expect(first.querySelector("[data-testid=toolbox-up]")).toBeNull();
    expect(second.querySelector("[data-testid=toolbox-down]")).toBeNull();
    expect(screen.getByRole("button", { name: m.moveDown })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: m.moveUp })));
    expect(move).toHaveBeenCalledWith("i1", -1);
    expect(screen.getAllByTestId("toolbox-item")[0]).toHaveTextContent("Text Sam");
  });

  it("Edit, then Save; Cancel leaves it as it was", async () => {
    update.mockReturnValueOnce(ok(items("Walk to the park")));
    open(items("Walk"));
    fireEvent.click(screen.getByTestId("toolbox-edit"));
    fireEvent.change(screen.getByTestId("toolbox-edit-text"), { target: { value: "Walk to the park" } });
    await act(async () => fireEvent.click(screen.getByTestId("toolbox-save")));
    expect(update).toHaveBeenCalledWith("i0", "Walk to the park");
    expect(screen.getByTestId("toolbox-item")).toHaveTextContent("Walk to the park");
    fireEvent.click(screen.getByTestId("toolbox-edit"));
    fireEvent.change(screen.getByTestId("toolbox-edit-text"), { target: { value: "Something else" } });
    fireEvent.click(screen.getByTestId("toolbox-cancel"));
    expect(screen.getByTestId("toolbox-item")).toHaveTextContent("Walk to the park");
  });

  it("a failed save: the generic line, and what was typed stays", async () => {
    add.mockReturnValueOnce(Promise.reject(new Error("offline")));
    open([]);
    fireEvent.change(screen.getByTestId("toolbox-new"), { target: { value: "Shower" } });
    await act(async () => fireEvent.click(screen.getByTestId("toolbox-add")));
    expect(screen.getByTestId("toolbox-failed")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getByTestId("toolbox-new")).toHaveValue("Shower");
  });

  it("a minute to breathe opens from here too", () => {
    open([]);
    fireEvent.click(screen.getByTestId("toolbox-breathe"));
    expect(screen.getByTestId("breathing")).toBeInTheDocument();
  });
});
