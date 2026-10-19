import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const setAiEnabled = vi.fn();
const saveTone = vi.fn();
const saveFocusAreas = vi.fn();
const recordAiWithdrawal = vi.fn();
vi.mock("./actions", () => ({
  setAiEnabled: (...a: unknown[]) => setAiEnabled(...a),
  recordAiWithdrawal: (...a: unknown[]) => recordAiWithdrawal(...a),
  saveTone: (...a: unknown[]) => saveTone(...a),
  saveFocusAreas: (...a: unknown[]) => saveFocusAreas(...a),
}));
const { AiSettings } = await import("./AiSettings");
const m = messages.ai;

const renderIt = (on = false, balance = 700) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AiSettings initial={{ on, tone: "warm", focus: ["sleep"] }} credits={{ balance }} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  for (const fn of [setAiEnabled, recordAiWithdrawal, saveTone, saveFocusAreas]) fn.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("Me → AI", () => {
  it("off: the switch, the consent text and the off hint; no tone or focus", () => {
    renderIt(false);
    expect(screen.getByTestId("me-ai-on")).not.toBeChecked();
    expect(screen.getByTestId("me-ai-consent")).toHaveTextContent(m.consentAiBody);
    expect(screen.getByTestId("me-ai-off")).toHaveTextContent(m.meAiOffHint);
    expect(screen.queryByTestId("me-ai-tone-warm")).toBeNull();
    expect(screen.getByTestId("me-ai-credits")).toHaveTextContent("700 credits");
  });

  it("turning it on saves at once and shows tone and focus", async () => {
    renderIt(false);
    fireEvent.click(screen.getByTestId("me-ai-on"));
    expect(setAiEnabled).toHaveBeenCalledWith(true);
    expect(await screen.findByTestId("me-ai-tone-warm")).toBeChecked();
    // Named by the tone, described by its hint (not one run-together name).
    expect(screen.getByTestId("me-ai-tone-warm")).toHaveAccessibleName(messages.ai.toneWarm);
    expect(screen.getByTestId("me-ai-tone-warm")).toHaveAccessibleDescription(messages.ai.toneWarmHint);
    expect(screen.getByTestId("me-ai-focus-sleep")).toHaveAttribute("aria-pressed", "true");
  });

  it("a failed switch goes back to what the account has; Try again resends it (decision 111)", async () => {
    setAiEnabled.mockResolvedValueOnce({ ok: false });
    renderIt(false);
    fireEvent.click(screen.getByTestId("me-ai-on"));
    expect(await screen.findByTestId("me-ai-error")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getByTestId("me-ai-on")).not.toBeChecked();
    fireEvent.click(screen.getByTestId("me-ai-retry"));
    await waitFor(() => expect(screen.getByTestId("me-ai-on")).toBeChecked());
    expect(setAiEnabled).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("me-ai-error")).toBeNull();
  });

  it("off, and only the withdrawal failed: the switch stays off (the account is off); Try again records just the withdrawal (reviewer #33)", async () => {
    setAiEnabled.mockResolvedValueOnce({ ok: false, aiEnabled: false, pending: "withdrawal" });
    renderIt(true);
    fireEvent.click(screen.getByTestId("me-ai-on"));
    expect(await screen.findByTestId("me-ai-error")).toBeInTheDocument();
    expect(screen.getByTestId("me-ai-on")).not.toBeChecked();
    expect(screen.getByTestId("me-ai-off")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("me-ai-retry"));
    await waitFor(() => expect(recordAiWithdrawal).toHaveBeenCalledTimes(1));
    expect(setAiEnabled).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("me-ai-error")).toBeNull());
    expect(screen.getByTestId("me-ai-on")).not.toBeChecked();
  });

  it("off, and switching off itself failed: back on (the account is still on)", async () => {
    setAiEnabled.mockResolvedValueOnce({ ok: false, aiEnabled: true });
    renderIt(true);
    fireEvent.click(screen.getByTestId("me-ai-on"));
    expect(await screen.findByTestId("me-ai-error")).toBeInTheDocument();
    expect(screen.getByTestId("me-ai-on")).toBeChecked();
    fireEvent.click(screen.getByTestId("me-ai-retry"));
    await waitFor(() => expect(setAiEnabled).toHaveBeenLastCalledWith(false));
    expect(recordAiWithdrawal).not.toHaveBeenCalled();
  });

  it("a thrown save (network off) also reverts", async () => {
    saveTone.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderIt(true);
    fireEvent.click(screen.getByTestId("me-ai-tone-brief"));
    expect(await screen.findByTestId("me-ai-retry")).toBeInTheDocument();
    expect(screen.getByTestId("me-ai-tone-warm")).toBeChecked();
  });

  it("tone saves on change; focus chips save the whole set in a fixed order", async () => {
    renderIt(true);
    // Input is ignored while a save is in flight: wait until it's done.
    const click = async (id: string) => {
      const el = screen.getByTestId(id);
      await waitFor(() => expect(el).not.toHaveAttribute("aria-disabled", "true"));
      fireEvent.click(el);
    };
    await click("me-ai-tone-direct");
    await waitFor(() => expect(saveTone).toHaveBeenCalledWith("direct"));
    await click("me-ai-focus-self_esteem");
    await waitFor(() => expect(saveFocusAreas).toHaveBeenLastCalledWith(["sleep", "self_esteem"]));
    await click("me-ai-focus-stress");
    await waitFor(() => expect(saveFocusAreas).toHaveBeenLastCalledWith(["sleep", "stress", "self_esteem"]));
    await click("me-ai-focus-sleep");
    await waitFor(() => expect(saveFocusAreas).toHaveBeenLastCalledWith(["stress", "self_esteem"]));
  });

  it("at 0 credits, the steady Lite state (creditsLiteNow), never creditsOut (decision 122)", () => {
    renderIt(true, 0);
    expect(screen.getByTestId("me-ai-credits")).toHaveTextContent("0 credits");
    expect(screen.getByTestId("me-ai-credits")).toHaveTextContent(m.creditsLiteNow);
    expect(screen.getByTestId("me-ai-credits")).not.toHaveTextContent(m.creditsOut);
  });
});

describe("Me → AI: keyboard focus survives a save (a11y pass)", () => {
  it("the control in use stays enabled and focused while saving; input meanwhile is ignored", async () => {
    let finish!: (v: unknown) => void;
    saveTone.mockReturnValueOnce(new Promise((r) => (finish = r)));
    renderIt(true);
    const direct = screen.getByTestId("me-ai-tone-direct");
    direct.focus();
    fireEvent.click(direct);
    await waitFor(() => expect(direct).toHaveAttribute("aria-disabled", "true"));
    expect(direct).toBeEnabled();
    expect(direct).toHaveFocus();
    fireEvent.click(screen.getByTestId("me-ai-tone-brief"));
    expect(saveTone).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
    expect(direct).not.toHaveAttribute("aria-disabled", "true");
    expect(direct).toBeChecked();
  });
});
