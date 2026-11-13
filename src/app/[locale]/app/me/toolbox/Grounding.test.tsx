import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { BodyScan, FiveSenses, GroundingLinks, NameIt } = await import("./Grounding");

const m = messages.toolbox;
const fetchSpy = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  vi.clearAllMocks();
});
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
const seconds = (n: number) => act(() => vi.advanceTimersByTime(n * 1000));
// Ruling 7: nothing is saved or sent; not even this browser keeps a step or a word.
const nothingKept = () => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(window.localStorage.length).toBe(0);
};

describe("5-4-3-2-1", () => {
  it("one sense per screen, in order, Next and Back; then the close and Done back to the list", () => {
    wrap(<FiveSenses />);
    const step = () => screen.getByTestId("senses-step");
    expect(step()).toHaveTextContent(m.senses5);
    expect(screen.queryByTestId("senses-back")).toBeNull();
    fireEvent.click(screen.getByTestId("senses-next"));
    expect(step()).toHaveTextContent(m.senses4);
    expect(step()).toHaveFocus();
    fireEvent.click(screen.getByTestId("senses-back"));
    expect(step()).toHaveTextContent(m.senses5);
    for (const key of ["senses4", "senses3", "senses2", "senses1"] as const) {
      fireEvent.click(screen.getByTestId("senses-next"));
      expect(step()).toHaveTextContent(m[key]);
    }
    fireEvent.click(screen.getByTestId("senses-next"));
    expect(screen.getByTestId("senses-end")).toHaveTextContent(m.groundingEnd);
    expect(screen.getByTestId("senses-end")).toHaveFocus();
    expect(screen.getByTestId("grounding-done")).toHaveAttribute("href", "/app/me/toolbox");
    nothingKept();
  });

  it("nothing to type: no field anywhere", () => {
    wrap(<FiveSenses />);
    expect(document.querySelector("input, textarea")).toBeNull();
  });
});

describe("Body scan", () => {
  it("opens with the way out, Stop and Pause first; a step every 20 s, said once each; the close after 2 min", async () => {
    wrap(<BodyScan />);
    expect(screen.getByTestId("body-scan-intro")).toHaveTextContent(m.bodyScanIntro);
    expect(screen.getByTestId("body-scan-stop")).toHaveAttribute("href", "/app/me/toolbox");
    expect(screen.getByTestId("body-scan-stop")).toHaveTextContent(m.stop);
    const step = () => screen.getByTestId("body-scan-step");
    expect(step()).toHaveTextContent(m.bodyScan1);
    expect(step()).toHaveAttribute("role", "status");
    await seconds(19);
    expect(step()).toHaveTextContent(m.bodyScan1);
    await seconds(1);
    expect(step()).toHaveTextContent(m.bodyScan2);
    await seconds(80);
    expect(step()).toHaveTextContent(m.bodyScan6);
    await seconds(20);
    expect(screen.getByTestId("body-scan-end")).toHaveTextContent(m.groundingEnd);
    expect(screen.queryByTestId("body-scan-stop")).toBeNull();
    nothingKept();
  });

  it("Pause holds the step and its time; Resume goes on from there", async () => {
    wrap(<BodyScan />);
    await seconds(15);
    fireEvent.click(screen.getByTestId("body-scan-pause"));
    expect(screen.getByTestId("body-scan-pause")).toHaveTextContent(m.resume);
    expect(screen.getByTestId("body-scan-pause")).toHaveAttribute("aria-pressed", "true");
    await seconds(60);
    expect(screen.getByTestId("body-scan-step")).toHaveTextContent(m.bodyScan1);
    fireEvent.click(screen.getByTestId("body-scan-pause"));
    expect(screen.getByTestId("body-scan-pause")).toHaveTextContent(m.pause);
    await seconds(4);
    expect(screen.getByTestId("body-scan-step")).toHaveTextContent(m.bodyScan1);
    await seconds(1);
    expect(screen.getByTestId("body-scan-step")).toHaveTextContent(m.bodyScan2);
  });
});

describe("Name it", () => {
  it("the mood words given, as chips, and only those; a tap thanks them, nothing saved", () => {
    wrap(<NameIt moods={[2, 4]} />);
    expect(screen.getByTestId("name-it-prompt")).toHaveTextContent(m.nameItPrompt);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([messages.today.mood2, messages.today.mood4]);
    expect(screen.getByTestId("name-it-thanks")).toHaveTextContent("");
    fireEvent.click(screen.getByTestId("name-it-4"));
    expect(screen.getByTestId("name-it-4")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("name-it-2")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("name-it-thanks")).toHaveTextContent(m.nameItThanks);
    expect(document.querySelector("input, textarea")).toBeNull();
    nothingKept();
  });

  it("the whole fixed list when it's given all five", () => {
    wrap(<NameIt moods={[1, 2, 3, 4, 5]} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([1, 2, 3, 4, 5].map((n) => messages.today[`mood${n}` as "mood1"]));
  });
});

describe("the three on the list", () => {
  it("links to each one's page, so they work before scripts do", () => {
    wrap(<GroundingLinks />);
    expect(screen.getByTestId("toolbox-senses")).toHaveAttribute("href", "/app/me/toolbox/5-4-3-2-1");
    expect(screen.getByTestId("toolbox-body-scan")).toHaveAttribute("href", "/app/me/toolbox/body-scan");
    expect(screen.getByTestId("toolbox-name-it")).toHaveAttribute("href", "/app/me/toolbox/name-it");
    expect(screen.getByTestId("toolbox-body-scan")).toHaveTextContent(m.groundingBodyScan);
  });
});
