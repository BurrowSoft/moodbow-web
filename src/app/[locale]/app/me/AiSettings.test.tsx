import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const setAiEnabled = vi.fn();
const saveTone = vi.fn();
const saveFocusAreas = vi.fn();
vi.mock("./actions", () => ({
  setAiEnabled: (...a: unknown[]) => setAiEnabled(...a),
  saveTone: (...a: unknown[]) => saveTone(...a),
  saveFocusAreas: (...a: unknown[]) => saveFocusAreas(...a),
}));
const { AiSettings } = await import("./AiSettings");
const m = messages.ai;

const renderIt = (on = false, lite = false, balance = 700) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AiSettings initial={{ on, tone: "warm", focus: ["sleep"] }} credits={{ balance, lite }} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  for (const fn of [setAiEnabled, saveTone, saveFocusAreas]) fn.mockReset().mockResolvedValue({ ok: true });
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

  it("a thrown save (network off) also reverts", async () => {
    saveTone.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderIt(true);
    fireEvent.click(screen.getByTestId("me-ai-tone-brief"));
    expect(await screen.findByTestId("me-ai-retry")).toBeInTheDocument();
    expect(screen.getByTestId("me-ai-tone-warm")).toBeChecked();
  });

  it("tone saves on change; focus chips save the whole set in a fixed order", async () => {
    renderIt(true);
    fireEvent.click(screen.getByTestId("me-ai-tone-direct"));
    await waitFor(() => expect(saveTone).toHaveBeenCalledWith("direct"));
    fireEvent.click(screen.getByTestId("me-ai-focus-self_esteem"));
    await waitFor(() => expect(saveFocusAreas).toHaveBeenLastCalledWith(["sleep", "self_esteem"]));
    fireEvent.click(screen.getByTestId("me-ai-focus-stress"));
    await waitFor(() => expect(saveFocusAreas).toHaveBeenLastCalledWith(["sleep", "stress", "self_esteem"]));
    fireEvent.click(screen.getByTestId("me-ai-focus-sleep"));
    await waitFor(() => expect(saveFocusAreas).toHaveBeenLastCalledWith(["stress", "self_esteem"]));
  });

  it("on Lite, the credits block says so", () => {
    renderIt(true, true, 0);
    expect(screen.getByTestId("me-ai-credits")).toHaveTextContent("0 credits");
    expect(screen.getByTestId("me-ai-credits")).toHaveTextContent(m.creditsOut);
  });
});
