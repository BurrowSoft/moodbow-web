// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const cancel = vi.fn(async () => ({}));
const retrieveSub = vi.fn();
let configured = true;
vi.mock("./stripe", () => ({
  getStripe: () => ({ subscriptions: { cancel } }),
  stripeConfigured: () => configured,
  retrieveSubscriptionOrNull: (...a: unknown[]) => retrieveSub(...a),
}));
const { cancelStripeBeforeDelete } = await import("./cancelOnDelete");

const client = (read: { data: unknown; error: unknown } | (() => never)) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (typeof read === "function" ? read() : read) }) }) }) }) as never;
const stripeRow = { user_id: "u1", source: "stripe", status: "trialing", store_subscription_id: "sub_1" };

afterEach(() => {
  vi.clearAllMocks();
  configured = true;
});

describe("cancelStripeBeforeDelete: Plus on the web stops before the account goes", () => {
  it("their running Stripe subscription: cancelled now", async () => {
    retrieveSub.mockResolvedValue({ id: "sub_1", status: "trialing", metadata: { user_id: "u1" } });
    expect(await cancelStripeBeforeDelete(client({ data: stripeRow, error: null }), "u1")).toBe("cancelled");
    expect(cancel).toHaveBeenCalledWith("sub_1");
  });

  it("nothing to cancel: no row, Play or Apple, already cancelled, or not theirs", async () => {
    expect(await cancelStripeBeforeDelete(client({ data: null, error: null }), "u1")).toBe("none");
    expect(await cancelStripeBeforeDelete(client({ data: { ...stripeRow, source: "apple" }, error: null }), "u1")).toBe("none");
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", status: "canceled", metadata: { user_id: "u1" } });
    expect(await cancelStripeBeforeDelete(client({ data: stripeRow, error: null }), "u1")).toBe("none");
    retrieveSub.mockResolvedValueOnce({ id: "sub_1", status: "active", metadata: { user_id: "u2" } });
    expect(await cancelStripeBeforeDelete(client({ data: stripeRow, error: null }), "u1")).toBe("none");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("never blocks the delete: any failure is left for the cancel cron", async () => {
    expect(await cancelStripeBeforeDelete(client({ data: null, error: { message: "down" } }), "u1")).toBe("left_for_cron");
    expect(
      await cancelStripeBeforeDelete(
        client(() => {
          throw new Error("no table");
        }),
        "u1",
      ),
    ).toBe("left_for_cron");
    retrieveSub.mockRejectedValueOnce(new Error("stripe down"));
    expect(await cancelStripeBeforeDelete(client({ data: stripeRow, error: null }), "u1")).toBe("left_for_cron");
    configured = false;
    expect(await cancelStripeBeforeDelete(client({ data: stripeRow, error: null }), "u1")).toBe("left_for_cron");
  });
});
