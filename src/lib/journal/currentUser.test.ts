// @vitest-environment node
import { describe, expect, it } from "vitest";
import { currentUser } from "./currentUser";

const client = (user: { id: string } | null, error: object | null) =>
  ({ auth: { getUser: async () => ({ data: { user }, error }) } }) as unknown as Parameters<typeof currentUser>[0];

describe("currentUser", () => {
  it("signed in", async () => {
    expect(await currentUser(client({ id: "u1" }, null))).toEqual({ user: { id: "u1" }, ended: false });
  });
  it("no session, or a revoked or deleted one: ended", async () => {
    for (const error of [{ name: "AuthSessionMissingError" }, { code: "session_not_found" }, { code: "refresh_token_not_found" }, { code: "user_not_found" }]) {
      expect(await currentUser(client(null, error)), JSON.stringify(error)).toEqual({ user: null, ended: true });
    }
  });
  it("an outage, a rate limit or an unknown error isn't an ended session", async () => {
    for (const error of [{ name: "AuthRetryableFetchError", status: 0 }, { status: 503 }, { status: 429, code: "over_request_rate_limit" }, { status: 400 }, null]) {
      expect(await currentUser(client(null, error)), JSON.stringify(error)).toEqual({ user: null, ended: false });
    }
  });
  it("no client (Supabase not configured): not ended", async () => {
    expect(await currentUser(null)).toEqual({ user: null, ended: false });
  });
});
