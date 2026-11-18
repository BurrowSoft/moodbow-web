import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { ShareLink } from "@/lib/share/shareLinks";

// Me → Share your week (1.4 G): the list, Stop sharing, the exact preview, Create, and the link
// shown once. The actions (040's functions) are mocked.
const previewShare = vi.fn();
const createShare = vi.fn();
const stopShare = vi.fn();
const loadShareLinks = vi.fn();
vi.mock("./actions", () => ({
  previewShare: (...a: unknown[]) => previewShare(...a),
  createShare: (...a: unknown[]) => createShare(...a),
  stopShare: (...a: unknown[]) => stopShare(...a),
  loadShareLinks: (...a: unknown[]) => loadShareLinks(...a),
}));
const { ShareMe } = await import("./ShareMe");
const m = messages.shareMe;

const week = (name: string | null) => ({
  status: "ok",
  first_name: name,
  week_start: "2026-11-16",
  days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${16 + i}`, mood: i < 2 ? 4 : null })),
  check_ins: 2,
  weeks_available: 0,
});
const link = (over: Partial<ShareLink> = {}): ShareLink => ({
  id: "l1",
  first_name: "Lee",
  include_routine: true,
  routine_item_ids: ["meds"],
  created_at: "2026-11-10T10:00:00Z",
  expires_at: "2099-12-10T10:00:00Z",
  revoked_at: null,
  view_count: 2,
  created_seen_at: "2026-11-10T10:05:00Z",
  first_view_seen_at: null,
  ...over,
});
const routine = [
  { id: "meds", name: "Morning meds", inAppointment: true },
  { id: "walk", name: "Walk", inAppointment: false },
];
const renderIt = (links: ShareLink[] = [link()]) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShareMe initialLinks={links} routine={routine} dateLocaleTag="en-GB" />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  previewShare.mockReset().mockResolvedValue(week(null));
  createShare.mockReset();
  stopShare.mockReset();
  loadShareLinks.mockReset().mockResolvedValue({ status: "ok", links: [link()] });
});
afterEach(cleanup);

describe("Me → Share your week", () => {
  it("the list: name, opened count, routine items; Stop sharing asks first, then stops", async () => {
    stopShare.mockResolvedValue({ status: "ok", links: [link({ revoked_at: "2026-11-18T00:00:00Z" })] });
    renderIt();
    await waitFor(() => expect(screen.getByTestId("share-link").dataset.state).toBe("active"));
    expect(screen.getByTestId("share-link").textContent).toContain("For Lee");
    expect(screen.getByTestId("share-link").textContent).toContain("Opened 2 times");
    expect(screen.getByTestId("share-link").textContent).toContain("Morning meds included");
    // No Copy on an existing link (only its hash is kept).
    expect(screen.queryByText(m.copy)).toBeNull();
    fireEvent.click(screen.getByTestId("share-stop"));
    expect(screen.getByTestId("share-stop-dialog")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("share-stop-yes")));
    expect(stopShare).toHaveBeenCalledWith("l1");
    await waitFor(() => expect(screen.getByTestId("share-link").dataset.state).toBe("stopped"));
  });

  it("the routine items start from the appointment ones; the preview is share_preview's answer, with the viewer's heading", async () => {
    previewShare.mockResolvedValue(week("Sam"));
    renderIt();
    expect((screen.getByTestId("share-item-meds") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("share-item-walk") as HTMLInputElement).checked).toBe(false);
    await waitFor(() => expect(screen.getByTestId("preview-title").textContent).toBe("Sam shared their week with you"));
    expect(previewShare).toHaveBeenLastCalledWith({ firstName: "", routineItemIds: ["meds"], expiryDays: 30 });
    expect(screen.getByTestId("preview-count").textContent).toBe("2 check-ins this week");
    expect(screen.getByTestId("share-consent").textContent).toBe(m.consent);
  });

  it("Create: the link shown once, with Copy; the options sent; the list reloaded", async () => {
    createShare.mockResolvedValue({ status: "ok", token: "T".repeat(43), expiresAt: "2026-12-18T00:00:00Z" });
    renderIt([]);
    fireEvent.change(screen.getByTestId("share-name"), { target: { value: "Lee" } });
    fireEvent.click(screen.getByTestId("share-expiry-90"));
    await act(async () => fireEvent.click(screen.getByTestId("share-create")));
    expect(createShare).toHaveBeenCalledWith({ firstName: "Lee", routineItemIds: ["meds"], expiryDays: 90 });
    await waitFor(() => expect(screen.getByTestId("share-created-url").textContent).toBe(`${window.location.origin}/s#${"T".repeat(43)}`));
    expect(screen.getByTestId("share-copy").textContent).toBe(m.copy);
    expect(loadShareLinks).toHaveBeenCalled();
  });

  it("3 active links: the limit line instead of the form", async () => {
    renderIt([link({ id: "a" }), link({ id: "b" }), link({ id: "c" })]);
    await waitFor(() => expect(screen.getByTestId("share-limit").textContent).toBe(m.limit));
    expect(screen.queryByTestId("share-create")).toBeNull();
  });

  it("the limit reached at create time says so", async () => {
    createShare.mockResolvedValue({ status: "error", error: "limit" });
    renderIt([]);
    await act(async () => fireEvent.click(screen.getByTestId("share-create")));
    await waitFor(() => expect(screen.getByTestId("share-error").textContent).toBe(m.limit));
  });
});
