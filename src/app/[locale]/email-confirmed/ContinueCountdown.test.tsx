import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
  Link: (p: { href: string; children: React.ReactNode; "data-testid"?: string }) => (
    <a href={p.href} data-testid={p["data-testid"]}>
      {p.children}
    </a>
  ),
}));
const { ContinueCountdown } = await import("./ContinueCountdown");
const { EmailConfirmedMessage } = await import("./EmailConfirmedMessage");
const m = messages.emailConfirmed;
// One second at a time: each tick schedules the next after it renders.
const seconds = (n: number) => {
  for (let i = 0; i < n; i++) act(() => vi.advanceTimersByTime(1000));
};
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);

beforeEach(() => {
  push.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ContinueCountdown (decision 134)", () => {
  it("moves on after 5 s; the sentence is announced once (static), the ticking number is visual only", () => {
    wrap(<ContinueCountdown href="/app" />);
    expect(screen.getByRole("status")).toHaveTextContent("Taking you to your journal in 5 seconds…");
    expect(screen.getByTestId("email-confirmed-seconds")).toHaveAttribute("aria-hidden", "true");
    seconds(4);
    expect(screen.getByTestId("email-confirmed-seconds")).toHaveTextContent("in 1 second…");
    expect(screen.getByRole("status")).toHaveTextContent("in 5 seconds…");
    expect(push).not.toHaveBeenCalled();
    seconds(1);
    expect(push).toHaveBeenCalledWith("/app");
  });

  it("Continue goes now; Stay on this page stops it for good", () => {
    wrap(<ContinueCountdown href="/sign-in" />);
    expect(screen.getByTestId("email-confirmed-continue")).toHaveAttribute("href", "/sign-in");
    expect(screen.getByTestId("email-confirmed-continue")).toHaveTextContent(m.emailConfirmedContinue);
    seconds(2);
    fireEvent.click(screen.getByRole("button", { name: m.emailConfirmedStay }));
    seconds(10);
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("email-confirmed-seconds")).toBeNull();
    expect(screen.queryByRole("button", { name: m.emailConfirmedStay })).toBeNull();
    expect(screen.getByTestId("email-confirmed-continue")).toBeInTheDocument();
  });
});

describe("EmailConfirmedMessage: when the countdown shows", () => {
  it("confirmed, with somewhere to go: yes; an email confirmed (a first email from the app, or a change) or the journal not live (null): the page stays as it is", () => {
    const first = wrap(<EmailConfirmedMessage fromQuery="ok" continueTo="/app" />);
    expect(screen.getByTestId("email-confirmed-countdown")).toBeInTheDocument();
    first.unmount();
    // Decision 216 (UX): someone who started in the app goes back to it; never
    // sent on to the web journal (a 404 on Production until it's live).
    const changed = wrap(<EmailConfirmedMessage fromQuery="email_changed" continueTo="/app" />);
    expect(screen.queryByTestId("email-confirmed-countdown")).toBeNull();
    expect(screen.getByTestId("email-confirmed-email_changed")).toHaveTextContent(m.emailChangedBody);
    seconds(10);
    expect(push).not.toHaveBeenCalled();
    changed.unmount();
    const notLive = wrap(<EmailConfirmedMessage fromQuery="ok" continueTo={null} />);
    expect(screen.queryByTestId("email-confirmed-countdown")).toBeNull();
    notLive.unmount();
    wrap(<EmailConfirmedMessage fromQuery="error" continueTo="/app" />);
    expect(screen.queryByTestId("email-confirmed-countdown")).toBeNull();
    seconds(10);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("decision 134 refinements (review of #42)", () => {
  it("to sign in: its own line", () => {
    wrap(<ContinueCountdown href="/sign-in" />);
    expect(screen.getByRole("status")).toHaveTextContent("Taking you to the sign-in page in 5 seconds…");
  });

  for (const [what, act_] of [
    ["a key press", () => fireEvent.keyDown(document.body, { key: "Tab" })],
    ["a pointer press", () => fireEvent.pointerDown(document.body)],
    ["a focus change", () => fireEvent.focusIn(document.body)],
  ] as const) {
    it(`${what} stops it, like Stay; Continue stays`, () => {
      wrap(<ContinueCountdown href="/app" />);
      act(() => act_());
      seconds(10);
      expect(push).not.toHaveBeenCalled();
      expect(screen.queryByTestId("email-confirmed-seconds")).toBeNull();
      expect(screen.getByTestId("email-confirmed-continue")).toBeInTheDocument();
    });
  }

  it("with the countdown the body is 'You're all set.'; without it, the usual body", () => {
    const live = wrap(<EmailConfirmedMessage fromQuery="ok" continueTo="/app" />);
    expect(screen.getByText(m.emailConfirmedWebBody)).toBeInTheDocument();
    expect(screen.queryByText(m.successBody)).toBeNull();
    live.unmount();
    wrap(<EmailConfirmedMessage fromQuery="ok" continueTo={null} />);
    expect(screen.getByText(m.successBody)).toBeInTheDocument();
  });
});
