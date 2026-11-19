import { describe, expect, it } from "vitest";
import contract from "../../../content/contracts/plus-entitlement.json";
import { hasPlus, inPaymentGrace, PAST_DUE_GRACE_MS, PLUS_SOURCES, type PlusSource } from "./entitlements";

// The app's contract (moodbow-app 041, supabase/contracts/plus-entitlement.json, vendored byte for
// byte): has_plus in SQL, the app's hasPlus and this one give the same answer for every case.
type Case = { name: string; source: string | null; status: string | null; period_start_offset_s: number | null; period_end_offset_s: number | null; plus: boolean };

const NOW = Date.UTC(2026, 11, 15, 12, 0, 0);
const at = (offset: number | null) => (offset === null ? null : new Date(NOW + offset * 1000).toISOString());

describe("plus-entitlement contract (041)", () => {
  it("is the contract this code implements: version 1, a 7-day grace", () => {
    expect(contract.contract).toBe("plus-entitlement");
    expect(contract.version).toBe(1);
    expect(PAST_DUE_GRACE_MS).toBe(604_800_000);
  });

  it.each((contract.cases as Case[]).map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const row =
      c.status === null || c.source === null
        ? null
        : { source: c.source as PlusSource, status: c.status, current_period_start: at(c.period_start_offset_s), current_period_end: at(c.period_end_offset_s) };
    if (row) expect(PLUS_SOURCES).toContain(row.source);
    expect(hasPlus(row, NOW)).toBe(c.plus);
  });

  it("the grace line in Me only for a Stripe past_due still inside its 7 days", () => {
    const pastDue = (startOffsetS: number) => ({ source: "stripe" as const, status: "past_due", current_period_start: at(startOffsetS), current_period_end: at(31_536_000) });
    expect(inPaymentGrace(pastDue(-604_799), NOW)).toBe(true);
    expect(inPaymentGrace(pastDue(-604_800), NOW)).toBe(false);
    expect(inPaymentGrace({ source: "stripe", status: "active", current_period_start: at(-1), current_period_end: at(86_400) }, NOW)).toBe(false);
    expect(inPaymentGrace({ source: "play", status: "past_due", current_period_start: at(-1), current_period_end: at(86_400) }, NOW)).toBe(false);
  });
});
