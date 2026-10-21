// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPORT_WAIT_MS, IMPORT_BATCH_WAIT_MS, SAVE_WAIT_MS, TimedOut, withTimeout } from "./withTimeout";

// The browser's waits on server actions someone is waiting on (UX, the
// timeout audit): saves 30 s, the export 45 s, an import batch 60 s.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("the waits UX set", () => {
    expect([SAVE_WAIT_MS, EXPORT_WAIT_MS, IMPORT_BATCH_WAIT_MS]).toEqual([30_000, 45_000, 60_000]);
  });

  it("an answer in time comes through; a failure is passed on as it is", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    await expect(withTimeout(Promise.reject(redirect), 1000)).rejects.toBe(redirect);
  });

  it("no answer by the deadline: TimedOut (no redirect digest), and a late answer is ignored", async () => {
    let answer: (v: string) => void = () => {};
    const settled = withTimeout(new Promise<string>((r) => (answer = r)), SAVE_WAIT_MS).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS);
    const error = await settled;
    expect(error).toBeInstanceOf(TimedOut);
    expect((error as { digest?: unknown }).digest).toBeUndefined();
    answer("late");
    await expect(settled).resolves.toBeInstanceOf(TimedOut);
  });
});
