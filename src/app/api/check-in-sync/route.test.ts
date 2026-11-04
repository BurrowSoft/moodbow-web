// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveCheckIn = vi.fn();
vi.mock("@/app/[locale]/app/actions", () => ({ saveCheckIn: (...a: unknown[]) => saveCheckIn(...a) }));
const { POST } = await import("./route");

const form = () => {
  const f = new FormData();
  f.set("local_date", "2026-10-02");
  f.set("mood", "4");
  return f;
};
const post = (origin: string | null, body: BodyInit = form()) =>
  POST(new Request("https://www.moodbow.com/api/check-in-sync", { method: "POST", body, headers: origin ? { origin } : {} }));

// Braces: a function returned from beforeEach is a teardown hook, and mockReset() returns the spy itself, which
// Vitest would then call after the test (rejecting, in the redirect case).
beforeEach(() => {
  saveCheckIn.mockReset();
});

// Sign-out's one sync try (#147), a plain request so it can be aborted and
// never queues ahead of the sign-out action (Web Tester, before #100).
describe("POST /api/check-in-sync", () => {
  it("same origin: saves with the card's rules and answers the status only", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: { mood: 4 } });
    const res = await post("https://www.moodbow.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "saved" });
    const sent = saveCheckIn.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(sent.entries())).toEqual({ local_date: "2026-10-02", mood: "4" });
  });

  it("another origin, or none: refused, nothing saved", async () => {
    for (const origin of ["https://evil.example", null]) {
      const res = await post(origin);
      expect(res.status, String(origin)).toBe(403);
    }
    expect(saveCheckIn).not.toHaveBeenCalled();
  });

  it("not saved (an error, or the session ended and it redirects): an error status, the check-in stays", async () => {
    saveCheckIn.mockResolvedValue({ status: "error", error: "unreachable" });
    expect(await (await post("https://www.moodbow.com")).json()).toEqual({ status: "error" });
    saveCheckIn.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;303;" }));
    expect(await (await post("https://www.moodbow.com")).json()).toEqual({ status: "error" });
  });
});
