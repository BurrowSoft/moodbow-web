import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const exportMyData = vi.fn();
const deleteMyAccount = vi.fn();
vi.mock("./actions", () => ({
  exportMyData: (...a: unknown[]) => exportMyData(...a),
  deleteMyAccount: (...a: unknown[]) => deleteMyAccount(...a),
}));
const { YourData } = await import("./YourData");
const m = messages.me;

const renderIt = (credits = 0) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <YourData credits={credits} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  exportMyData.mockReset();
  deleteMyAccount.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});
afterEach(cleanup);

describe("YourData: export", () => {
  it("downloads the file in the browser and says it's ready", async () => {
    exportMyData.mockResolvedValue({ status: "ok", json: "{}", date: "2026-10-02" });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("moodbow-export-2026-10-02.json");
    });
    renderIt();
    fireEvent.click(screen.getByTestId("me-export"));
    await waitFor(() => expect(screen.getByTestId("me-export-status")).toHaveTextContent(m.meExportReady));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("a failure says so", async () => {
    exportMyData.mockResolvedValue({ status: "error" });
    renderIt();
    fireEvent.click(screen.getByTestId("me-export"));
    await waitFor(() => expect(screen.getByTestId("me-export-status")).toHaveTextContent(messages.today.errGeneric));
  });
});

describe("YourData: delete account", () => {
  it("the dialog: title, body, the export-first link; Delete only once DELETE is typed", () => {
    renderIt();
    fireEvent.click(screen.getByTestId("me-delete"));
    const dialog = screen.getByRole("dialog", { name: m.deleteTitle });
    expect(dialog).toHaveAccessibleDescription(m.deleteBody);
    expect(screen.getByTestId("delete-export-first")).toHaveTextContent(m.deleteExportFirst);
    expect(screen.getByLabelText(m.deleteTypeConfirm)).toBeInTheDocument();
    expect(screen.getByTestId("delete-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("delete-confirm-input"), { target: { value: "delete" } });
    expect(screen.getByTestId("delete-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("delete-confirm-input"), { target: { value: "DELETE" } });
    expect(screen.getByTestId("delete-confirm")).toBeEnabled();
  });

  it("credits: warned only when there are some (one / many)", () => {
    renderIt(0);
    fireEvent.click(screen.getByTestId("me-delete"));
    expect(screen.queryByTestId("delete-credits")).toBeNull();
    cleanup();
    renderIt(1);
    fireEvent.click(screen.getByTestId("me-delete"));
    expect(screen.getByTestId("delete-credits")).toHaveTextContent("You'll also lose your 1 AI credit.");
    cleanup();
    renderIt(40);
    fireEvent.click(screen.getByTestId("me-delete"));
    expect(screen.getByTestId("delete-credits")).toHaveTextContent("You'll also lose your 40 AI credits.");
  });

  it("confirming sends DELETE; a failure shows the generic error and keeps the dialog", async () => {
    deleteMyAccount.mockResolvedValue({ status: "error", error: "generic" });
    renderIt();
    fireEvent.click(screen.getByTestId("me-delete"));
    fireEvent.change(screen.getByTestId("delete-confirm-input"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalled());
    expect((deleteMyAccount.mock.calls[0][1] as FormData).get("confirm")).toBe("DELETE");
    expect(await screen.findByTestId("delete-error")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getByTestId("delete-dialog")).toBeInTheDocument();
  });

  it("Cancel (or Escape) closes it and forgets what was typed", () => {
    renderIt();
    fireEvent.click(screen.getByTestId("me-delete"));
    fireEvent.change(screen.getByTestId("delete-confirm-input"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-cancel"));
    expect(screen.queryByTestId("delete-dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("me-delete"));
    expect(screen.getByTestId("delete-confirm-input")).toHaveValue("");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("delete-dialog")).toBeNull();
  });

  it("focus starts on the safe action, and Tab wraps inside the dialog", () => {
    renderIt();
    fireEvent.click(screen.getByTestId("me-delete"));
    const confirmButton = screen.getByTestId("delete-confirm");
    expect(screen.getByTestId("delete-export-first")).toHaveFocus();
    // From the last focusable (Cancel, Delete is disabled) Tab wraps to the first.
    screen.getByTestId("delete-cancel").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByTestId("delete-export-first")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByTestId("delete-cancel")).toHaveFocus();
    expect(confirmButton).toBeDisabled();
  });
});
