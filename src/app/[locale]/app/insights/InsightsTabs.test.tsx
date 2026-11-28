import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { InsightsTabs, INSIGHTS_VIEW_KEY } = await import("./InsightsTabs");
const t = messages.insights;

const HREFS = { patterns: "/app/insights?range=month", ai: "/app/insights?view=ai&range=month" };
const CHARTS = "THE CHARTS";
const AI_SIDE = "THE AI SIDE";
const show = (initial: "patterns" | "ai" = "patterns", named = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InsightsTabs initial={initial} named={named} hrefs={HREFS} patterns={<p>{CHARTS}</p>} ai={<p>{AI_SIDE}</p>} />
    </NextIntlClientProvider>,
  );
const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/en/app/insights?range=month");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InsightsTabs: Patterns | AI (decision 258)", () => {
  it("a tab list: two tabs, the selected one in the tab order and controlling its panel; the other panel hidden", () => {
    show();
    // Only where AI is shown: Insights' name with AI, said with "and" (UX, 27 Nov).
    expect(screen.getByRole("tablist", { name: messages.app.tabInsightsSpoken })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((e) => e.textContent)).toEqual([t.insightsSegPatterns, t.insightsSegAi]);
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("aria-selected", "true");
    expect(tab(t.insightsSegAi)).toHaveAttribute("aria-selected", "false");
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("tabindex", "0");
    expect(tab(t.insightsSegAi)).toHaveAttribute("tabindex", "-1");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent(CHARTS);
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab(t.insightsSegPatterns).id);
    expect(screen.getByTestId("insights-panel-ai")).not.toBeVisible();
    // Each tab is also its own address, for a click without scripts.
    expect(tab(t.insightsSegAi)).toHaveAttribute("href", HREFS.ai);
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("href", HREFS.patterns);
  });

  it("a click switches in place: the address follows (keeping ?range=), and the choice is kept on this device", () => {
    show();
    fireEvent.click(tab(t.insightsSegAi));
    expect(tab(t.insightsSegAi)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(AI_SIDE);
    expect(screen.getByTestId("insights-panel-patterns")).not.toBeVisible();
    expect(new URLSearchParams(window.location.search).get("view")).toBe("ai");
    expect(new URLSearchParams(window.location.search).get("range")).toBe("month");
    expect(window.location.pathname).toBe("/en/app/insights");
    expect(window.localStorage.getItem(INSIGHTS_VIEW_KEY)).toBe("ai");
    fireEvent.click(tab(t.insightsSegPatterns));
    expect(window.location.search).toBe("?range=month");
    expect(window.localStorage.getItem(INSIGHTS_VIEW_KEY)).toBe("patterns");
  });

  it("a click with a modifier (a new tab or window) is left to the browser", () => {
    show();
    fireEvent.click(tab(t.insightsSegAi), { ctrlKey: true });
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem(INSIGHTS_VIEW_KEY)).toBeNull();
  });

  it("arrow keys, Home and End move between the tabs and select them, focus following", () => {
    show();
    tab(t.insightsSegPatterns).focus();
    fireEvent.keyDown(tab(t.insightsSegPatterns), { key: "ArrowRight" });
    expect(tab(t.insightsSegAi)).toHaveAttribute("aria-selected", "true");
    expect(tab(t.insightsSegAi)).toHaveFocus();
    fireEvent.keyDown(tab(t.insightsSegAi), { key: "ArrowLeft" });
    expect(tab(t.insightsSegPatterns)).toHaveFocus();
    fireEvent.keyDown(tab(t.insightsSegPatterns), { key: "End" });
    expect(tab(t.insightsSegAi)).toHaveFocus();
    fireEvent.keyDown(tab(t.insightsSegAi), { key: "Home" });
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab(t.insightsSegPatterns), { key: "Enter" });
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("aria-selected", "true");
  });

  it("the last choice on this device comes back after load; the address's own choice wins over it", async () => {
    window.localStorage.setItem(INSIGHTS_VIEW_KEY, "ai");
    show();
    await act(async () => {});
    expect(tab(t.insightsSegAi)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(AI_SIDE);
    cleanup();
    // ?view=ai (named): AI, kept.
    window.localStorage.setItem(INSIGHTS_VIEW_KEY, "patterns");
    show("ai", true);
    await act(async () => {});
    expect(tab(t.insightsSegAi)).toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem(INSIGHTS_VIEW_KEY)).toBe("ai");
    cleanup();
    // Something else kept: the default.
    window.localStorage.setItem(INSIGHTS_VIEW_KEY, "<script>");
    show();
    await act(async () => {});
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("aria-selected", "true");
  });

  it("storage blocked: Patterns, and the tabs still switch", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    await act(async () => {});
    expect(tab(t.insightsSegPatterns)).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tab(t.insightsSegAi));
    expect(tab(t.insightsSegAi)).toHaveAttribute("aria-selected", "true");
  });
});
