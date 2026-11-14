import { describe, expect, it } from "vitest";
import type { ConditionId, PageGate } from "@/lib/conditions";
import { LAPSED_DRAFT_MS, letterWrite, lettersGate } from "./letters";

const NOW = Date.parse("2026-12-10T12:00:00Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();
const gates = (own: PageGate, plus: PageGate) => (id: ConditionId) => (id === "letters-live" ? own : id === "plus" ? plus : "hidden");

describe("lettersGate: letters exist only with both switches (letters wait for Plus)", () => {
  it("hidden when either is hidden", () => {
    expect(lettersGate(gates("live", "hidden"))).toBe("hidden");
    expect(lettersGate(gates("hidden", "live"))).toBe("hidden");
  });
  it("live only when both are live; a draft otherwise", () => {
    expect(lettersGate(gates("live", "live"))).toBe("live");
    expect(lettersGate(gates("draft", "live"))).toBe("draft");
    expect(lettersGate(gates("live", "draft"))).toBe("draft");
  });
});

describe("letterWrite: the server's check on saving a new letter", () => {
  it("Plus, trialing or active inside its period: write", () => {
    expect(letterWrite({ status: "trialing", current_period_end: at(86_400_000) }, false, NOW)).toBe("plus");
    expect(letterWrite({ status: "active", current_period_end: at(1) }, true, NOW)).toBe("plus");
  });
  it("no row, never Plus, past_due or canceled long ago: locked", () => {
    expect(letterWrite(null, false, NOW)).toBe("locked");
    expect(letterWrite({ status: "past_due", current_period_end: at(-LAPSED_DRAFT_MS - 1) }, false, NOW)).toBe("locked");
    expect(letterWrite({ status: "canceled", current_period_end: null }, false, NOW)).toBe("locked");
  });
  it("Plus ended in the last 24 hours: one save of the draft in progress, and only one", () => {
    const lapsed = { status: "canceled", current_period_end: at(-60_000) };
    expect(letterWrite(lapsed, false, NOW)).toBe("lapsed_once");
    expect(letterWrite(lapsed, true, NOW)).toBe("locked");
    expect(letterWrite({ status: "active", current_period_end: at(-LAPSED_DRAFT_MS + 1) }, false, NOW)).toBe("lapsed_once");
    expect(letterWrite({ status: "active", current_period_end: at(-LAPSED_DRAFT_MS) }, false, NOW)).toBe("locked");
  });
});
