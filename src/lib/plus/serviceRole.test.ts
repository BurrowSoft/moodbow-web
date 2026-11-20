// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntitlementWrite } from "./serviceRole";

// insertEntitlement's three answers (sw14, 20 Nov): a new row, one already there, and a person who no longer exists.
// The database is a fake: what the upsert answers is set per test.
let upsertAnswer: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ upsert: () => ({ select: async () => upsertAnswer }) }) }),
}));
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://staging.example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-not-real");
});
afterEach(() => vi.unstubAllEnvs());
const { insertEntitlement } = await import("./serviceRole");

const ROW: EntitlementWrite = {
  source: "stripe",
  status: "canceled",
  trial_ends_at: null,
  current_period_end: "2026-11-26T17:25:17.000Z",
  current_period_start: "2026-11-19T17:25:17.000Z",
  trial_started_at: "2026-11-19T17:25:17.000Z",
  store_customer_id: "cus_1",
  store_subscription_id: "sub_1",
  store_product_id: "price_1",
};

describe("insertEntitlement", () => {
  it("a new row: true; one already there (the upsert ignored the duplicate): false", async () => {
    upsertAnswer = { data: [{ user_id: "u1" }], error: null };
    expect(await insertEntitlement("u1", ROW)).toEqual({ ok: true, value: true });
    upsertAnswer = { data: [], error: null };
    expect(await insertEntitlement("u1", ROW)).toEqual({ ok: true, value: false });
  });

  it("the person no longer exists (23503, the foreign key to auth.users: the account was deleted): user_gone, not a failure", async () => {
    upsertAnswer = { data: null, error: { code: "23503", message: "insert or update on table violates foreign key constraint" } };
    expect(await insertEntitlement("u_deleted", ROW)).toEqual({ ok: true, value: "user_gone" });
  });

  it("any other database error is a failure, so the webhook answers 500 and Stripe retries", async () => {
    for (const error of [{ code: "57014", message: "statement timeout" }, { code: "PGRST301", message: "JWT expired" }, { message: "fetch failed" }]) {
      upsertAnswer = { data: null, error };
      expect(await insertEntitlement("u1", ROW), JSON.stringify(error)).toEqual({ ok: false });
    }
  });
});
