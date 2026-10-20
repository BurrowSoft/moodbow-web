// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { onArrival, requestArrival, takeArrival } from "./arrival";

describe("arrival (1.1 O)", () => {
  it("a request waits for its target, is taken once, and only by that kind", () => {
    requestArrival("checkIn");
    expect(takeArrival("search")).toBe(false);
    expect(takeArrival("checkIn")).toBe(true);
    expect(takeArrival("checkIn")).toBe(false);
  });

  it("a target that mounts later takes the waiting request; one already mounted gets it at once", () => {
    requestArrival("checkIn");
    const later = vi.fn();
    const stop = onArrival("checkIn", later);
    expect(later).toHaveBeenCalledTimes(1);
    requestArrival("checkIn");
    expect(later).toHaveBeenCalledTimes(2);
    stop();
    requestArrival("checkIn");
    expect(later).toHaveBeenCalledTimes(2);
    expect(takeArrival("checkIn")).toBe(true);
  });
});
