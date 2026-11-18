import { createHash } from "node:crypto";

// Share with someone I trust (1.4 G; plans/PLAN-trusted-share.md, passed by the Reviewer 18 Nov;
// moodbow-app migration 040). Server only: the viewer's token is checked and hashed here, in
// /api/share/view, and only its sha256 ever reaches the database (the Reviewer's blocker 2).
//
// A token is share_create's 32 random bytes as base64url without padding: exactly 43 characters.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const MAX_WEEK = 3;

// The sha256 of the token's raw bytes, as PostgREST takes a bytea ("\x" + hex). null for anything
// that isn't a token (then the route answers unavailable, after the same floor).
export function tokenHash(token: unknown): string | null {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length !== 32) return null;
  return `\\x${createHash("sha256").update(raw).digest("hex")}`;
}

// The week asked for: 0 (this week) to 3. Anything else is week 0, as share_view clamps.
export function weekAsked(week: unknown): number {
  return typeof week === "number" && Number.isInteger(week) && week >= 0 && week <= MAX_WEEK ? week : 0;
}

export type SharedDay = { date: string; mood: number | null };
export type SharedRoutine = { name: string; percent: number | null };
export type SharedWeek =
  | { status: "unavailable" }
  // weeks_available (proposed for 040, additive): how many earlier weeks exist from the link's
  // creation, so the viewer never asks for one that doesn't (each such ask would count as a view).
  | { status: "ok"; first_name: string | null; week_start: string; days: SharedDay[]; check_ins: number; routine?: SharedRoutine[]; weeks_available?: number };

const UNAVAILABLE = { status: "unavailable" } as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isMood = (m: unknown): m is number | null => m === null || (typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 5);

// share_view's answer, checked field by field: only these keys ever leave the route, whatever the
// database sends. Anything off the shape is unavailable, never a partial week.
export function parseSharedWeek(value: unknown): SharedWeek {
  const v = value as Record<string, unknown> | null;
  if (!v || v.status !== "ok") return UNAVAILABLE;
  const days = v.days;
  if (!Array.isArray(days) || days.length !== 7) return UNAVAILABLE;
  const parsedDays: SharedDay[] = [];
  for (const d of days as Record<string, unknown>[]) {
    if (!d || typeof d.date !== "string" || !ISO.test(d.date) || !isMood(d.mood ?? null)) return UNAVAILABLE;
    parsedDays.push({ date: d.date, mood: (d.mood as number | null) ?? null });
  }
  if (typeof v.week_start !== "string" || !ISO.test(v.week_start)) return UNAVAILABLE;
  if (typeof v.check_ins !== "number" || !Number.isInteger(v.check_ins) || v.check_ins < 0 || v.check_ins > 7) return UNAVAILABLE;
  const firstName = typeof v.first_name === "string" && v.first_name.trim() !== "" ? v.first_name : null;
  const out: SharedWeek = { status: "ok", first_name: firstName, week_start: v.week_start, days: parsedDays, check_ins: v.check_ins };
  if (v.weeks_available !== undefined) {
    if (typeof v.weeks_available !== "number" || !Number.isInteger(v.weeks_available) || v.weeks_available < 0 || v.weeks_available > MAX_WEEK) return UNAVAILABLE;
    out.weeks_available = v.weeks_available;
  }
  if (Array.isArray(v.routine)) {
    const routine: SharedRoutine[] = [];
    for (const r of v.routine as Record<string, unknown>[]) {
      if (!r || typeof r.name !== "string") return UNAVAILABLE;
      const percent = r.percent === null || r.percent === undefined ? null : r.percent;
      if (percent !== null && (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 100)) return UNAVAILABLE;
      routine.push({ name: r.name, percent });
    }
    out.routine = routine;
  }
  return out;
}

// Every answer waits until at least this long after the request began, so a miss, a revoked
// link and a capped one can't be told apart by time (the plan's §6).
export const RESPONSE_FLOOR_MS = 300;
