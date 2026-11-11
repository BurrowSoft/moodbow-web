import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
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

const show = (view: PlusView, { aiShown = false, started = false } = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlusScreen view={view} price="US$59.99" aiShown={aiShown} started={started} />
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
    expect(within(footer).getByTestId("plus-price")).toHaveTextContent("7 days free, then US$59.99 a year");
    expect(footer).toHaveTextContent(m.renews);
    expect(within(footer).getByTestId("plus-start")).toHaveTextContent(m.startTrial);
    expect(within(footer).getByTestId("plus-not-now")).toHaveAttribute("href", "/app/me");
    expect(footer.textContent).not.toMatch(/20\d\d|charged on|reminder/i);
    // The table is in its own box with a scrollbar that's always there.
    const scroll = screen.getByTestId("plus-scroll");
    expect(scroll.className).toContain("overflow-y-scroll");
    expect(scroll).toContainElement(screen.getByTestId("plus-table"));
    expect(scroll).not.toContainElement(footer);
  });

  it("today's free ranges and patterns are Free; what Plus adds is Plus only; the AI rows only with AI", () => {
    show({ kind: "free", trial: true });
    // The Free column's cell, then Plus's: free rows are Included in both.
    const free = (row: string) => within(within(screen.getByTestId(`plus-row-${row}`)).getAllByRole("cell")[0]);
    expect(free("rowRanges").getByRole("img", { name: m.included })).toBeInTheDocument();
    expect(free("rowPatterns").getByRole("img", { name: m.included })).toBeInTheDocument();
    expect(free("rowYear").getByRole("img", { name: m.plusOnly })).toBeInTheDocument();
    expect(free("rowBreathing").getByRole("img", { name: m.plusOnly })).toBeInTheDocument();
    expect(screen.queryByTestId("plus-row-rowAiFree")).toBeNull();
    cleanup();
    show({ kind: "free", trial: true }, { aiShown: true });
    expect(screen.getByTestId("plus-row-rowAiFree")).toBeInTheDocument();
    expect(screen.getByTestId("plus-row-rowAiPlus")).toBeInTheDocument();
  });

  it("the free week used: the yearly price and Start Plus", () => {
    show({ kind: "free", trial: false });
    expect(screen.getByTestId("plus-price")).toHaveTextContent("US$59.99 a year");
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
    const heights: Record<string, number> = { "plus-footer": 400, "plus-scroll": 60 };
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: heights[this.getAttribute("data-testid") ?? ""] ?? 0 } as DOMRect;
    });
    vi.stubGlobal("innerHeight", 640);
    const { unmount } = show({ kind: "free", trial: true });
    const footer = screen.getByTestId("plus-footer");
    expect(screen.getByTestId("plus-screen")).toHaveAttribute("data-large");
    expect(within(footer).getByTestId("plus-price")).toBeTruthy();
    expect(within(footer).getByTestId("plus-renews")).toHaveTextContent(m.renews);
    expect(within(footer).getByTestId("plus-start")).toBeTruthy();
    expect(within(footer).queryByTestId("plus-not-now")).toBeNull();
    expect(within(screen.getByTestId("plus-rest")).getByTestId("plus-not-now")).toBeTruthy();
    expect(footer.className).toContain("sticky");
    // One scroll for the page: the table's box is no longer a scroll area of its own.
    expect(screen.getByTestId("plus-scroll")).not.toHaveAttribute("tabindex");
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
