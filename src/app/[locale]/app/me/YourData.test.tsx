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
const UID = "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70";
const KEYS = [`mb:pending-checkin:${UID}:2026-10-02`, `mb:draft-entry:${UID}:new`];

const renderIt = (credits = 0) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <YourData credits={credits} uid={UID} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  exportMyData.mockReset();
  deleteMyAccount.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});
afterEach(cleanup);

describe("YourData: export", () => {
  it("one Export, then two links: the readable copy (.txt) and the data file (.json), named by the day", async () => {
    const doc = { format: "moodbow-export", format_version: 1, exported_at: "2026-10-02T09:30:00Z", account: { email: "a@b.co" }, check_ins: [], entries: [] };
    exportMyData.mockResolvedValue({ status: "ok", json: JSON.stringify(doc), date: "2026-10-02" });
    const blobs: Blob[] = [];
    (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mockImplementation((b: Blob) => (blobs.push(b), `blob:${blobs.length}`));
    renderIt();
    fireEvent.click(screen.getByTestId("me-export"));
    await waitFor(() => expect(screen.getByTestId("me-export-status")).toHaveTextContent(m.meExportReady));
    const txt = screen.getByRole("link", { name: m.exportReadable });
    const json = screen.getByRole("link", { name: m.exportData });
    expect(txt).toHaveAttribute("download", "moodbow-journal-2026-10-02.txt");
    expect(json).toHaveAttribute("download", "moodbow-export-2026-10-02.json");
    expect(await blobs[0].text()).toBe("Moodbow: your journal\nExported: 2026-10-02 09:30 UTC\nAccount: a@b.co\nThis file holds your private journal. Keep it somewhere safe.\n");
    expect(blobs[1].type).toBe("application/json");
  });

  it("a format the renderer doesn't know: the data file alone (no partial text)", async () => {
    exportMyData.mockResolvedValue({ status: "ok", json: JSON.stringify({ format: "moodbow-export", format_version: 2 }), date: "2026-10-02" });
    renderIt();
    fireEvent.click(screen.getByTestId("me-export"));
    expect(await screen.findByRole("link", { name: m.exportData })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: m.exportReadable })).toBeNull();
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

describe("YourData: this browser forgets a deleted account (decision 85; reviewer #17)", () => {
  const redirectTo = (url: string) => Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  const confirmDelete = () => {
    fireEvent.click(screen.getByTestId("me-delete"));
    fireEvent.change(screen.getByTestId("delete-confirm-input"), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-confirm"));
  };
  beforeEach(() => {
    window.localStorage.clear();
    for (const k of KEYS) window.localStorage.setItem(k, "x");
    window.localStorage.setItem("mb:pending-checkin:someone-else:2026-10-02", "y");
  });

  it("deleted: this user's copies are gone at once, others' stay", async () => {
    deleteMyAccount.mockRejectedValue(redirectTo("/sign-in?signed_out=deleted"));
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    const swallow = (e: Event) => e.preventDefault();
    window.addEventListener("error", swallow);
    try {
      renderIt();
      confirmDelete();
      await waitFor(() => expect(KEYS.every((k) => window.localStorage.getItem(k) === null)).toBe(true));
      expect(window.localStorage.getItem("mb:pending-checkin:someone-else:2026-10-02")).toBe("y");
    } finally {
      window.removeEventListener("error", swallow);
      onError.mockRestore();
    }
  });

  it("a failed delete (or another redirect, e.g. to sign-in) keeps them", async () => {
    deleteMyAccount.mockResolvedValue({ status: "error", error: "generic" });
    renderIt();
    confirmDelete();
    await screen.findByTestId("delete-error");
    expect(KEYS.every((k) => window.localStorage.getItem(k) === "x")).toBe(true);
  });
});
