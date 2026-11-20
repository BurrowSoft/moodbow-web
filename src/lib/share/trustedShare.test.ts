// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSharedWeek, tokenHash, weekAsked } from "./trustedShare";

const tokenOf = (raw: Buffer) => raw.toString("base64url");

describe("the share token (1.4 G)", () => {
  it("a real token (32 bytes, 43 base64url characters) hashes to sha256 of its raw bytes, as bytea hex", () => {
    const raw = randomBytes(32);
    const token = tokenOf(raw);
    expect(token).toHaveLength(43);
    expect(tokenHash(token)).toBe(`\\x${createHash("sha256").update(raw).digest("hex")}`);
  });

  it("anything else is no token", () => {
    const good = tokenOf(randomBytes(32));
    for (const bad of [undefined, null, 42, "", good.slice(1), `${good}A`, `${good.slice(0, 42)}+`, `${good.slice(0, 42)}/`, `${good.slice(0, 42)}=`, " ".repeat(43), { token: good }]) expect(tokenHash(bad)).toBeNull();
  });

  it("the week is 0-3, anything else 0", () => {
    expect([0, 1, 2, 3].map(weekAsked)).toEqual([0, 1, 2, 3]);
    for (const w of [-1, 4, 1.5, "1", null, undefined, NaN]) expect(weekAsked(w)).toBe(0);
  });
});

describe("share_view's answer", () => {
  const ok = {
    status: "ok",
    first_name: "Sam",
    week_start: "2026-11-16",
    days: ["16", "17", "18", "19", "20", "21", "22"].map((d, i) => ({ date: `2026-11-${d}`, mood: i < 3 ? i + 2 : null })),
    check_ins: 3,
    routine: [
      { name: "Morning meds", percent: 83 },
      { name: "Walk", percent: null },
    ],
  };

  it("an ok week passes with only its own keys", () => {
    const parsed = parseSharedWeek({ ...ok, user_id: "x", token_hash: "y", body: "never" });
    expect(parsed).toEqual(ok);
    expect(Object.keys(parsed).sort()).toEqual(["check_ins", "days", "first_name", "routine", "status", "week_start"]);
  });

  it("no routine key when the link has none; a blank name is no name", () => {
    const { routine: _routine, ...noRoutine } = ok;
    void _routine;
    expect(parseSharedWeek({ ...noRoutine, first_name: "  " })).toEqual({ ...noRoutine, first_name: null });
  });

  it("weeks_available (optional, 0-3) passes when sent; anything else in it is unavailable", () => {
    expect(parseSharedWeek({ ...ok, weeks_available: 2 })).toEqual({ ...ok, weeks_available: 2 });
    for (const bad of [-1, 4, 1.5, "2"]) expect(parseSharedWeek({ ...ok, weeks_available: bad })).toEqual({ status: "unavailable" });
  });

  it("anything off the shape is unavailable, never a partial week", () => {
    for (const bad of [
      null,
      { status: "unavailable" },
      { ...ok, days: ok.days.slice(1) },
      { ...ok, days: [...ok.days.slice(1), { date: "2026-11-22", mood: 9 }] },
      { ...ok, week_start: "soon" },
      { ...ok, check_ins: 8 },
      { ...ok, routine: [{ name: "x", percent: 101 }] },
      { ...ok, routine: [{ percent: 5 }] },
    ])
      expect(parseSharedWeek(bad)).toEqual({ status: "unavailable" });
  });
});
