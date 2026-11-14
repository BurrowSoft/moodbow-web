import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROTECTIVE_ONBOARDING } from "./setupLater";

// The app layout completes onboarding with these the first time (1.3 §6; the Reviewer, #314).
describe("protective onboarding", () => {
  it("the reminder off; tone, focus and AI never sent, so they keep their defaults", () => {
    expect(PROTECTIVE_ONBOARDING).toEqual({ p_reminder_on: false, p_reminder_time: "21:00" });
    expect(Object.keys(PROTECTIVE_ONBOARDING)).not.toEqual(expect.arrayContaining(["p_tone"]));
    expect(Object.keys(PROTECTIVE_ONBOARDING).some((k) => /tone|focus|ai/.test(k))).toBe(false);
  });
  it("is what the layout sends, and only when Setup is still owed", () => {
    const layout = readFileSync("src/app/[locale]/app/layout.tsx", "utf8");
    expect(layout).toContain('supabase.rpc("complete_onboarding", PROTECTIVE_ONBOARDING)');
    expect(layout).toMatch(/if \(step === "setup"\) \{\s*\n\s*const \{ error: setupError \} = await supabase\.rpc\("complete_onboarding", PROTECTIVE_ONBOARDING\)/);
  });
});
