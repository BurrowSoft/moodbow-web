import { afterEach, describe, expect, it, vi } from "vitest";
import { broadcastSignOut, onSignOut, SIGN_OUT_KEY } from "./signOutSignal";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("signOutSignal: telling this browser's other tabs (UX & PM 2026-11-03)", () => {
  it("BroadcastChannel where there is one: the message reaches a listener on another channel object", () => {
    // A minimal channel: every open object of the same name but the sender gets it.
    const open = new Set<FakeChannel>();
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(readonly name: string) {
        open.add(this);
      }
      postMessage(data: unknown) {
        for (const c of open) if (c !== this && c.name === this.name) c.onmessage?.({ data } as MessageEvent);
      }
      close() {
        open.delete(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const heard = vi.fn();
    const stop = onSignOut(heard);
    broadcastSignOut({ uid: "u1", mode: "delete" });
    expect(heard).toHaveBeenCalledWith({ uid: "u1", mode: "delete" });
    // The sender's own channel is closed after sending; the listener's on stop.
    expect(open.size).toBe(1);
    stop();
    expect(open.size).toBe(0);
  });

  it("without BroadcastChannel: a storage event on a key that's written and removed at once", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const heard = vi.fn();
    const stop = onSignOut(heard);
    broadcastSignOut({ uid: "u1", mode: "keep" });
    // Nothing is left behind.
    expect(window.localStorage.getItem(SIGN_OUT_KEY)).toBeNull();
    // Another tab sees the write as a storage event (this one never does).
    window.dispatchEvent(new StorageEvent("storage", { key: SIGN_OUT_KEY, newValue: JSON.stringify({ uid: "u1", mode: "keep" }) }));
    expect(heard).toHaveBeenCalledWith({ uid: "u1", mode: "keep" });
    // Its removal, other keys and malformed messages are ignored.
    window.dispatchEvent(new StorageEvent("storage", { key: SIGN_OUT_KEY, newValue: null }));
    window.dispatchEvent(new StorageEvent("storage", { key: "mb:theme", newValue: "dark" }));
    window.dispatchEvent(new StorageEvent("storage", { key: SIGN_OUT_KEY, newValue: JSON.stringify({ uid: "u1", mode: "wipe" }) }));
    window.dispatchEvent(new StorageEvent("storage", { key: SIGN_OUT_KEY, newValue: "not json" }));
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new StorageEvent("storage", { key: SIGN_OUT_KEY, newValue: JSON.stringify({ uid: "u1", mode: "keep" }) }));
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
