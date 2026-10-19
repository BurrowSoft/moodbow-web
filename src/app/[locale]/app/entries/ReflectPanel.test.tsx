import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const reflectOnEntry = vi.fn();
const deleteReflection = vi.fn();
vi.mock("./reflectActions", () => ({
  reflectOnEntry: (...a: unknown[]) => reflectOnEntry(...a),
  deleteReflection: (...a: unknown[]) => deleteReflection(...a),
}));
const { ReflectPanel } = await import("./ReflectPanel");
const m = messages.ai;

const ENTRY = "3d6f1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const reflection = (over: object = {}) => ({ id: "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70", body: "A long day.\nWhat helped?", tier: "full" as const, created_at: "2026-10-19T09:00:00Z", ...over });
const ok = (over: object = {}, balance: number | null = 600) => ({ status: "ok", reflection: reflection(over), balance });
const renderIt = (initial: ReturnType<typeof reflection> | null = null, balance = 600) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReflectPanel entryId={ENTRY} initial={initial} balance={balance} />
    </NextIntlClientProvider>,
  );
const keys = () => reflectOnEntry.mock.calls.map((c) => c[1] as string);
// Let the pending promises settle.
const settle = () => act(async () => {});

beforeEach(() => {
  reflectOnEntry.mockReset();
  deleteReflection.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReflectPanel", () => {
  it("tap: loading with the button disabled, then the reflection as plain text with its line breaks (decision 120)", async () => {
    let answer!: (v: unknown) => void;
    reflectOnEntry.mockReturnValueOnce(new Promise((r) => (answer = r)));
    renderIt();
    const button = screen.getByTestId("reflect-button");
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByTestId("reflect-status")).toHaveTextContent(m.reflectLoading);
    fireEvent.click(button);
    expect(reflectOnEntry).toHaveBeenCalledTimes(1);
    await act(async () => answer(ok({ body: "A long day.\n\nWhat helped? <b>x</b>" })));
    const body = screen.getByTestId("reflect-body");
    expect(body.textContent).toBe("A long day.\n\nWhat helped? <b>x</b>");
    expect(body.querySelector("b")).toBeNull();
    expect(body).toHaveClass("whitespace-pre-line");
    expect(button).toBeEnabled();
    expect(reflectOnEntry).toHaveBeenCalledWith(ENTRY, expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  it("in_progress: the same client_key again every 2 s until it answers", async () => {
    vi.useFakeTimers();
    reflectOnEntry.mockResolvedValueOnce({ status: "in_progress" }).mockResolvedValueOnce({ status: "in_progress" }).mockResolvedValueOnce(ok());
    renderIt();
    fireEvent.click(screen.getByTestId("reflect-button"));
    await settle();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByTestId("reflect-body")).toBeInTheDocument();
    expect(keys()).toHaveLength(3);
    expect(new Set(keys()).size).toBe(1);
  });

  it("still in_progress after ~30 s: stop asking, errOffline; Try again resends the same key (reviewer #34)", async () => {
    vi.useFakeTimers();
    reflectOnEntry.mockResolvedValue({ status: "in_progress" });
    renderIt();
    fireEvent.click(screen.getByTestId("reflect-button"));
    await act(async () => vi.advanceTimersByTimeAsync(31_000));
    expect(screen.getByTestId("reflect-error")).toHaveTextContent(m.errOffline);
    const first = keys()[0];
    const asked = keys().length;
    reflectOnEntry.mockResolvedValueOnce(ok());
    fireEvent.click(screen.getByTestId("reflect-retry"));
    await settle();
    expect(keys()).toHaveLength(asked + 1);
    expect(new Set(keys())).toEqual(new Set([first]));
    expect(screen.getByTestId("reflect-body")).toBeInTheDocument();
  });

  it("a call that never answers: after 55 s, errOffline; Try again resends the same key (Web Tester, #35)", async () => {
    vi.useFakeTimers();
    reflectOnEntry.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(ok());
    renderIt();
    fireEvent.click(screen.getByTestId("reflect-button"));
    await act(async () => vi.advanceTimersByTimeAsync(54_999));
    expect(screen.getByTestId("reflect-status")).toHaveTextContent(m.reflectLoading);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByTestId("reflect-error")).toHaveTextContent(m.errOffline);
    expect(screen.getByTestId("reflect-button")).toBeEnabled();
    fireEvent.click(screen.getByTestId("reflect-retry"));
    await settle();
    expect(keys()).toHaveLength(2);
    expect(keys()[1]).toBe(keys()[0]);
    expect(screen.getByTestId("reflect-body")).toBeInTheDocument();
  });

  it("no answer from the function (no_answer): errOffline and the same key on Try again; a final error after it means a new key next tap", async () => {
    reflectOnEntry.mockResolvedValueOnce({ status: "no_answer" }).mockResolvedValueOnce({ status: "error", message: "reflectError" }).mockResolvedValueOnce(ok());
    renderIt();
    fireEvent.click(screen.getByTestId("reflect-button"));
    await settle();
    expect(screen.getByTestId("reflect-error")).toHaveTextContent(m.errOffline);
    fireEvent.click(screen.getByTestId("reflect-retry"));
    await settle();
    expect(keys()[1]).toBe(keys()[0]);
    expect(screen.getByTestId("reflect-error")).toHaveTextContent(m.reflectError);
    fireEvent.click(screen.getByTestId("reflect-button"));
    await settle();
    expect(keys()[2]).not.toBe(keys()[0]);
  });

  it("no answer reached the browser: errOffline; Try again resends the same key", async () => {
    reflectOnEntry.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok());
    renderIt();
    fireEvent.click(screen.getByTestId("reflect-button"));
    await settle();
    expect(screen.getByTestId("reflect-error")).toHaveTextContent(m.errOffline);
    fireEvent.click(screen.getByTestId("reflect-retry"));
    await settle();
    expect(screen.getByTestId("reflect-body")).toBeInTheDocument();
    expect(keys()[0]).toBe(keys()[1]);
  });

  it("the contract's errors show their copy; ai_disabled hides Reflect", async () => {
    for (const message of ["dailyLimit", "errRateLimited", "meAiOffHint", "reflectError"] as const) {
      reflectOnEntry.mockResolvedValueOnce({ status: "error", message });
      const view = renderIt();
      fireEvent.click(screen.getByTestId("reflect-button"));
      await settle();
      expect(screen.getByTestId("reflect-error")).toHaveTextContent(m[message]);
      view.unmount();
    }
    reflectOnEntry.mockResolvedValueOnce({ status: "hidden" });
    renderIt();
    fireEvent.click(screen.getByTestId("reflect-button"));
    await settle();
    expect(screen.queryByTestId("reflect-panel")).toBeNull();
  });

  it("an existing reflection; reflecting again replaces it; Lite gets its badge; creditsOut once, when they run out", async () => {
    renderIt(reflection({ body: "Old one." }), 1);
    expect(screen.getByTestId("reflect-body")).toHaveTextContent("Old one.");
    expect(screen.queryByTestId("reflect-lite")).toBeNull();
    reflectOnEntry.mockResolvedValueOnce(ok({ body: "New one.", tier: "lite" }, 0));
    fireEvent.click(screen.getByTestId("reflect-button"));
    await settle();
    expect(screen.getByTestId("reflect-body")).toHaveTextContent("New one.");
    expect(screen.getByTestId("reflect-lite")).toHaveTextContent(m.reflectLiteBadge);
    expect(screen.getByTestId("reflect-credits-out")).toHaveTextContent(m.creditsOut);
    reflectOnEntry.mockResolvedValueOnce(ok({ body: "Third.", tier: "lite" }, 0));
    fireEvent.click(screen.getByTestId("reflect-button"));
    await settle();
    expect(screen.queryByTestId("reflect-credits-out")).toBeNull();
  });

  it("a reflection that names Get help now shows that button, which opens the safety card (decision 124)", () => {
    const view = renderIt(reflection({ body: `Please reach out to someone today.\nThe "${messages.me.meGetHelpNow}" button in Moodbow has numbers you can call.` }));
    fireEvent.click(screen.getByTestId("reflect-get-help"));
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    view.unmount();
    // The label in another shipped language (an entry written in Thai, the
    // UI in English) counts too (reviewer #35).
    const thai = renderIt(reflection({ body: "ลองคุยกับใครสักคนวันนี้ ปุ่ม \"ขอความช่วยเหลือตอนนี้\" ใน Moodbow มีเบอร์ให้โทร" }));
    expect(screen.getByTestId("reflect-get-help")).toBeInTheDocument();
    thai.unmount();
    renderIt(reflection({ body: "A calm day. What made it calm?" }));
    expect(screen.queryByTestId("reflect-get-help")).toBeNull();
  });

  it("delete asks first (decision 122); cancel keeps it; confirm removes it; a failure says so", async () => {
    renderIt(reflection());
    fireEvent.click(screen.getByTestId("reflect-delete"));
    const dialog = screen.getByTestId("reflect-delete-dialog");
    expect(dialog).toHaveTextContent(m.reflectDeleteConfirmTitle);
    expect(dialog).toHaveTextContent(m.reflectDeleteConfirmBody);
    fireEvent.click(screen.getByTestId("reflect-delete-cancel"));
    expect(screen.getByTestId("reflect-body")).toBeInTheDocument();
    expect(deleteReflection).not.toHaveBeenCalled();

    deleteReflection.mockResolvedValueOnce({ ok: false });
    fireEvent.click(screen.getByTestId("reflect-delete"));
    fireEvent.click(screen.getByTestId("reflect-delete-confirm"));
    await settle();
    expect(screen.getByTestId("reflect-delete-error")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getByTestId("reflect-body")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reflect-delete"));
    fireEvent.click(screen.getByTestId("reflect-delete-confirm"));
    await settle();
    expect(deleteReflection).toHaveBeenLastCalledWith(reflection().id);
    expect(screen.queryByTestId("reflect-result")).toBeNull();
    expect(screen.getByTestId("reflect-button")).toBeEnabled();
  });
});

describe("ReflectPanel: Moodbow's voice colours (decision 150)", () => {
  it("the reflection sits on the voice surface with the voice rule; the Lite badge is the voice colour; nothing follows the mood", () => {
    renderIt(reflection({ tier: "lite" }));
    const card = screen.getByTestId("reflect-result");
    expect(card.className).toMatch(/\bbg-voice-surface\b/);
    expect(card.className).toMatch(/\bborder-voice\b/);
    expect(screen.getByTestId("reflect-lite").className).toMatch(/\btext-voice\b/);
    expect(card.className).not.toMatch(/accent|#[0-9a-f]{6}/i);
  });
});
