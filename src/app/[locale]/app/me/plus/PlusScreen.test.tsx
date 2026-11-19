import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SAVE_WAIT_MS } from "@/lib/ui/withTimeout";
import type { PlusView } from "@/lib/plus/view";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { PlusScreen } = await import("./PlusScreen");
const m = messages.plus;

const show = (view: PlusView, { started = false } = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlusScreen view={view} price="US$59.99" started={started} />
    </NextIntlClientProvider>,
  );
const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("PlusScreen: the table scrolls, the footer never does", () => {
  it("before the trial: the price, the renewal line and one button, in the footer; no first-charge date", () => {
    show({ kind: "free", trial: true });
    const footer = screen.getByTestId("plus-footer");
    // The words (UX, board 2): Try 7 days free, then the price and the renewal under the button.
    expect(within(footer).getByTestId("plus-price")).toHaveTextContent(m.trialFree);
    expect(within(footer).getByTestId("plus-renews")).toHaveTextContent("Then US$59.99 a year · renews automatically");
    expect(within(footer).getByTestId("plus-cancel")).toHaveTextContent(m.cancelWhere);
    expect(within(footer).getByTestId("plus-start")).toHaveTextContent(m.startTrial);
    expect(within(footer).getByTestId("plus-not-now")).toHaveAttribute("href", "/app/me");
    expect(footer.textContent).not.toMatch(/20\d\d|charged on|reminder/i);
    // The table is in its own box with a scrollbar that's always there.
    const scroll = screen.getByTestId("plus-scroll");
    expect(scroll.className).toContain("overflow-y-scroll");
    expect(scroll).toContainElement(screen.getByTestId("plus-table"));
    expect(scroll).not.toContainElement(footer);
  });

  it("your journal is free, insights are Plus (Vitor, 14 Nov): the rows in order, and no AI rows", () => {
    show({ kind: "free", trial: true });
    expect(screen.getByText(m.lead)).toBeInTheDocument();
    const order = screen.getAllByTestId(/^plus-row-/).map((r) => r.getAttribute("data-testid"));
    expect(order).toEqual(
      ["rowJournal", "rowTimeline", "rowHelp", "rowAppointment", "rowData", "rowInsights", "rowMorePatterns", "rowReview", "rowLetters", "rowExtras", "rowPdf", "rowThemes"].map((k) => `plus-row-${k}`),
    );
    // The Free column's cell: free rows are Included, Plus rows are Plus only.
    const free = (row: string) => within(within(screen.getByTestId(`plus-row-${row}`)).getAllByRole("cell")[0]);
    for (const row of ["rowJournal", "rowTimeline", "rowHelp", "rowAppointment", "rowData"]) expect(free(row).getByRole("img", { name: m.included })).toBeInTheDocument();
    for (const row of ["rowInsights", "rowMorePatterns", "rowReview", "rowLetters", "rowExtras", "rowPdf", "rowThemes"]) expect(free(row).getByRole("img", { name: m.plusOnly })).toBeInTheDocument();
    expect(screen.getByTestId("plus-table").textContent).not.toMatch(/\bAI\b/);
  });

  it("the free week used: the yearly price and Start Plus", () => {
    show({ kind: "free", trial: false });
    expect(screen.getByTestId("plus-price")).toHaveTextContent("US$59.99 a year");
    expect(screen.getByTestId("plus-renews")).toHaveTextContent(m.renews);
    expect(screen.getByTestId("plus-start")).toHaveTextContent(m.start);
  });

  it("the button asks for Stripe's page; a failure is the generic line; no email: the line saying so", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ code: "checkout_failed" }) });
    show({ kind: "free", trial: true });
    await act(async () => fireEvent.click(screen.getByTestId("plus-start")));
    expect(fetchMock).toHaveBeenCalledWith("/api/checkout/stripe", expect.objectContaining({ method: "POST", body: JSON.stringify({ locale: "en" }) }));
    expect(screen.getByTestId("plus-error")).toHaveTextContent(messages.today.errGeneric);
    fetchMock.mockResolvedValueOnce({ json: async () => ({ code: "needs_email" }) });
    await act(async () => fireEvent.click(screen.getByTestId("plus-start")));
    expect(screen.getByTestId("plus-error")).toHaveTextContent(m.needsEmail);
  });

  it("a dead connection: the button gives up at SAVE_WAIT_MS with the generic line and works again (audit D)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    show({ kind: "free", trial: true });
    await act(async () => fireEvent.click(screen.getByTestId("plus-start")));
    expect(fetchMock).toHaveBeenCalledWith("/api/checkout/stripe", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(timeout).toHaveBeenCalledWith(SAVE_WAIT_MS);
    expect(screen.getByTestId("plus-error")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getByTestId("plus-start")).not.toBeDisabled();
    timeout.mockRestore();
  });

  it("has Plus: the title says so; Stripe: Manage Plus; a store: where to manage it; no price, no trial", () => {
    show({ kind: "plus", source: "stripe", daysLeft: null });
    expect(screen.getByTestId("plus-title")).toHaveTextContent(m.titleHas);
    expect(screen.getByTestId("plus-manage")).toHaveTextContent(m.manage);
    expect(screen.queryByTestId("plus-price")).toBeNull();
    expect(screen.queryByTestId("plus-start")).toBeNull();
    cleanup();
    show({ kind: "plus", source: "play", daysLeft: 3 });
    expect(screen.getByTestId("plus-manage-store")).toHaveTextContent(m.managePlay);
    cleanup();
    show({ kind: "plus", source: "apple", daysLeft: null });
    expect(screen.getByTestId("plus-manage-store")).toHaveTextContent(m.manageApple);
  });

  it("large text (the footer over 40 % of the screen): the page scrolls, the bar steps aside, only the price, the renewal line and the button stay pinned", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    // 300 of 640: over 40 % (large), under 60 % (still pinned; over it unpins, #271's rule).
    const heights: Record<string, number> = { "plus-footer": 300, "plus-scroll": 60 };
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: heights[this.getAttribute("data-testid") ?? ""] ?? 0 } as DOMRect;
    });
    vi.stubGlobal("innerHeight", 640);
    const { unmount } = show({ kind: "free", trial: true });
    const footer = screen.getByTestId("plus-footer");
    expect(screen.getByTestId("plus-screen")).toHaveAttribute("data-large");
    expect(within(footer).getByTestId("plus-price")).toHaveTextContent(m.trialFree);
    expect(within(footer).getByTestId("plus-renews")).toHaveTextContent("Then US$59.99 a year · renews automatically");
    expect(within(footer).getByTestId("plus-start")).toBeTruthy();
    expect(within(footer).queryByTestId("plus-not-now")).toBeNull();
    expect(within(screen.getByTestId("plus-rest")).getByTestId("plus-not-now")).toBeTruthy();
    // Fixed at the bottom, with room kept under the page's end for it (its measured height).
    expect(footer.className).toContain("fixed");
    expect(document.body.style.paddingBottom).toBe("300px");
    // One scroll for the page: the table's box is no longer a scroll area of its own.
    expect(screen.getByTestId("plus-scroll")).not.toHaveAttribute("tabindex");
    expect(document.documentElement).toHaveAttribute("data-tabs-aside");
    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-tabs-aside");
    expect(document.body.style.paddingBottom).toBe("");
    rect.mockRestore();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
  });

  // UX 12 Nov (specs/plus.md, the app's rule too): where even the compact pinned part would leave
  // the content under 40 % (over 60 % of a short screen at large text), nothing is pinned: one
  // scroll, ending with the price, the renewal line and the button together, after Not now.
  it("large text on a short screen (the pinned part over 60 %): it unpins, and the page ends with the price, the renewal line and the button", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const heights: Record<string, number> = { "plus-footer": 300, "plus-scroll": 60 };
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: heights[this.getAttribute("data-testid") ?? ""] ?? 0 } as DOMRect;
    });
    vi.stubGlobal("innerHeight", 480);
    const { unmount } = show({ kind: "free", trial: true });
    const root = screen.getByTestId("plus-screen");
    const footer = screen.getByTestId("plus-footer");
    expect(root).toHaveAttribute("data-large");
    expect(root).toHaveAttribute("data-unpinned");
    expect(footer.className).not.toContain("fixed");
    expect(document.body.style.paddingBottom).toBe("");
    // The page ends with them, together, after Not now.
    for (const id of ["plus-price", "plus-renews", "plus-start"]) expect(within(footer).getByTestId(id)).toBeTruthy();
    const notNow = within(screen.getByTestId("plus-rest")).getByTestId("plus-not-now");
    expect(notNow.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.lastElementChild).toBe(footer);
    // Still one page scroll, the bar aside, as at large text.
    expect(document.documentElement).toHaveAttribute("data-tabs-aside");
    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-tabs-aside");
    rect.mockRestore();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("large text with Plus: nothing pinned; Manage at the end of the content", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const heights: Record<string, number> = { "plus-footer": 205, "plus-scroll": 83 };
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: heights[this.getAttribute("data-testid") ?? ""] ?? 0 } as DOMRect;
    });
    vi.stubGlobal("innerHeight", 640);
    show({ kind: "plus", source: "stripe", daysLeft: 5 });
    expect(screen.getByTestId("plus-screen")).toHaveAttribute("data-large");
    expect(screen.queryByTestId("plus-footer")).toBeNull();
    expect(within(screen.getByTestId("plus-rest")).getByTestId("plus-manage")).toHaveTextContent(m.manage);
    rect.mockRestore();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("a failed renewal: the state line and Update card", () => {
    show({ kind: "past_due" });
    expect(screen.getByTestId("plus-footer")).toHaveTextContent(m.pastDue);
    expect(screen.getByTestId("plus-update-card")).toHaveTextContent(m.updateCard);
  });

  it("back from Stripe before the webhook: Starting your Plus…, looking again, then a calm line after about 20 s", () => {
    vi.useFakeTimers();
    show({ kind: "free", trial: true }, { started: true });
    expect(screen.getByTestId("plus-waiting")).toHaveTextContent(m.starting);
    expect(screen.queryByTestId("plus-start")).toBeNull();
    act(() => vi.advanceTimersByTime(6_000));
    expect(refresh).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(14_000));
    expect(screen.getByTestId("plus-waiting")).toHaveTextContent(m.onItsWay);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PlusScreen: the close X and the Christmas offer (1.3)", () => {
  const offer = { firstYear: "€24.99", price: "€49.99" };
  const withOffer = () =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlusScreen view={{ kind: "free", trial: true }} price="€49.99" offer={offer} started={false} />
      </NextIntlClientProvider>,
    );
  it("a close X on the title's row, named Close, back to Me (offer or not)", () => {
    show({ kind: "free", trial: true });
    expect(screen.getByTestId("plus-close")).toHaveAttribute("href", "/app/me");
    expect(screen.getByTestId("plus-close")).toHaveAccessibleName(m.close);
  });
  it("the offer: no kicker; the strip, the first year, its button, the renewal right under it, where to cancel; no free week, no % off", () => {
    withOffer();
    expect(screen.queryByTestId("plus-eyebrow")).toBeNull();
    const footer = screen.getByTestId("plus-footer");
    expect(within(footer).getByTestId("plus-offer-strip")).toHaveTextContent(m.offerLabel);
    expect(within(footer).getByTestId("plus-price")).toHaveTextContent("Your first year: €24.99");
    expect(within(footer).getByTestId("plus-start")).toHaveTextContent("Get my first year for €24.99");
    expect(within(footer).getByTestId("plus-renews")).toHaveTextContent("Then €49.99 a year · renews automatically");
    expect(within(footer).getByTestId("plus-start").nextElementSibling).toBe(within(footer).getByTestId("plus-renews"));
    expect(within(footer).getByTestId("plus-cancel")).toHaveTextContent(m.cancelWhere);
    expect(footer.textContent).not.toMatch(/7 days|free|%|half/i);
  });
});

describe("PlusScreen: the footer's order, and the short screen (#271's unpin, restored)", () => {
  it("the price, the button, the renewal line under it, then where to cancel", () => {
    show({ kind: "free", trial: true });
    const ids = [...screen.getByTestId("plus-footer").querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"));
    const order = ["plus-price", "plus-start", "plus-renews", "plus-cancel"].map((id) => ids.indexOf(id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });
  it("large text where even the pinned part would take over 60 % of the screen: nothing pinned (data-unpinned)", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const heights: Record<string, number> = { "plus-footer": 400, "plus-scroll": 60 };
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: heights[this.getAttribute("data-testid") ?? ""] ?? 0 } as DOMRect;
    });
    vi.stubGlobal("innerHeight", 640);
    const { unmount } = show({ kind: "free", trial: true });
    expect(screen.getByTestId("plus-screen")).toHaveAttribute("data-unpinned");
    expect(screen.getByTestId("plus-footer").className).not.toContain("fixed");
    expect(document.body.style.paddingBottom).toBe("");
    unmount();
    rect.mockRestore();
    vi.unstubAllGlobals();
  });

  it("the tap test (UX, 14 Nov): pinned leaves the content 40 %+, but Not now can't come out from under the pinned part at the end: nothing pinned", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    // 300 of 640 (pinned by the 60 % rule), but Not now's centre at the page's end is at 522 px,
    // under the pinned part's top at 340 px: a tap there would land on the price or Start.
    const boxes: Record<string, { top: number; height: number }> = { "plus-footer": { top: 340, height: 300 }, "plus-scroll": { top: 0, height: 60 }, "plus-not-now": { top: 500, height: 44 } };
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return (boxes[this.getAttribute("data-testid") ?? ""] ?? { top: 0, height: 0 }) as DOMRect;
    });
    vi.stubGlobal("innerHeight", 640);
    const { unmount } = show({ kind: "free", trial: true });
    expect(screen.getByTestId("plus-screen")).toHaveAttribute("data-unpinned");
    expect(screen.getByTestId("plus-footer").className).not.toContain("fixed");
    unmount();
    rect.mockRestore();
    vi.unstubAllGlobals();
  });
});
