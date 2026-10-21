// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATA_DEADLINE_MS, dataDeadlineMs, EXPORT_DEADLINE_MS, fetchUntil, isDeadlineError } from "./deadline";

// The data deadline (UX, the timeout audit): a PostgREST request is given up
// after 15 s (the export after 30 s) with an AbortError, which postgrest-js
// answers at once without retrying; Auth and edge functions keep their own.
const REST = "https://x.supabase.co/rest/v1";

// A fetch that never answers until its signal aborts.
const hang = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));

beforeEach(() => {
  vi.useFakeTimers();
  hang.mockClear();
  vi.stubGlobal("fetch", hang);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isDeadlineError", () => {
  it("postgrest-js's answer to an aborted request; nothing else", () => {
    expect(isDeadlineError({ message: "AbortError: Supabase didn't answer in time" })).toBe(true);
    expect(isDeadlineError({ message: "AbortError: Supabase Auth didn't answer in time" })).toBe(true);
    expect(isDeadlineError({ message: "TypeError: fetch failed" })).toBe(false);
    expect(isDeadlineError({ message: "stale_write" })).toBe(false);
    expect(isDeadlineError(null)).toBe(false);
  });
});

describe("dataDeadlineMs", () => {
  it("REST calls 15 s, the full export 30 s; Auth and edge functions none", () => {
    expect(dataDeadlineMs(`${REST}/rpc/upsert_check_in`)).toBe(DATA_DEADLINE_MS);
    expect(dataDeadlineMs(`${REST}/check_ins?select=*`)).toBe(DATA_DEADLINE_MS);
    expect(dataDeadlineMs(`${REST}/rpc/export_my_data`)).toBe(EXPORT_DEADLINE_MS);
    expect(dataDeadlineMs("https://x.supabase.co/auth/v1/user")).toBeNull();
    expect(dataDeadlineMs("https://x.supabase.co/functions/v1/reflect")).toBeNull();
    expect([DATA_DEADLINE_MS, EXPORT_DEADLINE_MS]).toEqual([15_000, 30_000]);
  });
});

describe("fetchUntil: a data request that never answers", () => {
  it("is given up at 15 s with an AbortError (postgrest-js doesn't retry that)", async () => {
    const call = fetchUntil(new AbortController().signal)(`${REST}/rpc/save_entry`, { method: "POST" });
    const settled = call.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DATA_DEADLINE_MS - 1);
    expect(hang).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const error = (await settled) as DOMException;
    expect(error.name).toBe("AbortError");
  });

  it("the export gets 30 s", async () => {
    let done = false;
    const settled = fetchUntil(new AbortController().signal)(`${REST}/rpc/export_my_data`, { method: "POST" }).catch((e: unknown) => {
      done = true;
      return e;
    });
    await vi.advanceTimersByTimeAsync(DATA_DEADLINE_MS + 1000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(EXPORT_DEADLINE_MS - DATA_DEADLINE_MS);
    expect(((await settled) as DOMException).name).toBe("AbortError");
  });

  it("an edge function or Auth call isn't cut by it (reflect keeps its own 45 s)", async () => {
    let done = false;
    void fetchUntil(new AbortController().signal)("https://x.supabase.co/functions/v1/reflect", { method: "POST" }).catch(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(EXPORT_DEADLINE_MS + 5000);
    expect(done).toBe(false);
  });

  it("the Auth deadline's signal still stops it sooner", async () => {
    const auth = new AbortController();
    const settled = fetchUntil(auth.signal)(`${REST}/rpc/get_me`).catch((e: unknown) => e);
    auth.abort(new DOMException("auth", "AbortError"));
    expect(((await settled) as DOMException).message).toBe("auth");
  });

  it("an answer in time comes through untouched", async () => {
    const ok = new Response("{}");
    hang.mockResolvedValueOnce(ok);
    await expect(fetchUntil(new AbortController().signal)(`${REST}/rpc/get_me`)).resolves.toBe(ok);
  });
});
