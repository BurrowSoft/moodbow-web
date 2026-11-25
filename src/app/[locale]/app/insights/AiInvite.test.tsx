import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { POLICY_VERSIONS } from "@/lib/legalVersions";

// Me's actions module (its Stripe import aside): only setAiEnabled matters here.
const setAiEnabled = vi.fn();
vi.mock("../me/actions", () => ({ setAiEnabled: (...a: unknown[]) => setAiEnabled(...a) }));
const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { AiInvite } = await import("./AiInvite");
const m = messages.ai;

const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AiInvite />
    </NextIntlClientProvider>,
  );
const sheet = () => screen.queryByRole("dialog", { name: m.aiConfirmTitle });
const settle = () => act(async () => {});

beforeEach(() => {
  setAiEnabled.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

describe("Insights → AI's invitation (decision 258, board 30b; the Reviewer's must)", () => {
  it("the invitation: its title, its words, one Turn on AI", () => {
    show();
    expect(screen.getByRole("heading", { name: m.aiInviteTitle })).toBeInTheDocument();
    expect(screen.getByTestId("insights-ai-invite")).toHaveTextContent(m.aiInviteBody);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([m.aiConfirmTurnOn]);
  });

  it("its button only opens the sheet (the consent text word for word, focus on Not now): nothing is sent", async () => {
    show();
    fireEvent.click(screen.getByTestId("insights-ai-invite-turn-on"));
    expect(sheet()).toBeInTheDocument();
    expect(sheet()).toHaveTextContent(m.consentAiBody);
    expect(screen.getByTestId("insights-ai-sheet-not-now")).toHaveFocus();
    await settle();
    expect(setAiEnabled).not.toHaveBeenCalled();
  });

  it("Not now, Escape or a tap outside: the sheet closes and nothing is recorded", async () => {
    show();
    fireEvent.click(screen.getByTestId("insights-ai-invite-turn-on"));
    fireEvent.click(screen.getByTestId("insights-ai-sheet-not-now"));
    expect(sheet()).toBeNull();
    fireEvent.click(screen.getByTestId("insights-ai-invite-turn-on"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(sheet()).toBeNull();
    fireEvent.click(screen.getByTestId("insights-ai-invite-turn-on"));
    fireEvent.click(screen.getByTestId("insights-ai-sheet-backdrop"));
    expect(sheet()).toBeNull();
    await settle();
    expect(setAiEnabled).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("the sheet's Turn on AI: Me's own action, once, with this build's version; then the page reads again as AI on", async () => {
    setAiEnabled.mockResolvedValue({ ok: true });
    show();
    fireEvent.click(screen.getByTestId("insights-ai-invite-turn-on"));
    fireEvent.click(screen.getByTestId("insights-ai-sheet-turn-on"));
    await settle();
    expect(setAiEnabled.mock.calls).toEqual([[true, { version: POLICY_VERSIONS.ai }]]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a save that fails (or never answers) says so, and the page isn't read again", async () => {
    for (const answer of [() => Promise.resolve({ ok: false, aiEnabled: false }), () => Promise.reject(new Error("offline"))]) {
      setAiEnabled.mockReset().mockImplementation(answer);
      refresh.mockReset();
      show();
      fireEvent.click(screen.getByTestId("insights-ai-invite-turn-on"));
      fireEvent.click(screen.getByTestId("insights-ai-sheet-turn-on"));
      await settle();
      expect(screen.getByRole("alert")).toHaveTextContent(messages.today.errGeneric);
      expect(refresh).not.toHaveBeenCalled();
      cleanup();
    }
  });
});
