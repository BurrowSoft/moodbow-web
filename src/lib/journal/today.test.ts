import { describe, expect, it } from "vitest";
import { checkInErrorAction, parseCheckIn } from "./checkIn";
import { dateLine, dateLocale, greetingKey, localHour } from "./today";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("greetingKey (M4: 05–11 morning, 12–17 afternoon, 18–04 evening)", () => {
  it("covers every hour", () => {
    expect([4, 5, 11, 12, 17, 18, 23, 0].map(greetingKey)).toEqual([
      "greetEvening",
      "greetMorning",
      "greetMorning",
      "greetAfternoon",
      "greetAfternoon",
      "greetEvening",
      "greetEvening",
      "greetEvening",
    ]);
  });
});

describe("localHour", () => {
  // A fixed instant, so the test never depends on today's date or zone.
  const instant = new Date("2026-10-02T23:30:00Z");
  it("uses the profile's zone, not the machine's", () => {
    expect(localHour("Asia/Bangkok", instant)).toBe(6);
    expect(localHour("America/Sao_Paulo", instant)).toBe(20);
    expect(localHour("UTC", instant)).toBe(23);
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(localHour("Not/AZone", instant)).toBe(23);
  });
});

describe("dateLine", () => {
  it("formats the local date itself in the region's order (no zone can shift it)", () => {
    expect(dateLine("2026-10-02", "en-US")).toBe("Friday, October 2, 2026");
    expect(dateLine("2026-10-02", "en-GB")).toBe("Friday, 2 October 2026");
    expect(dateLine("2026-01-01", "en-AU")).toBe("Thursday 1 January 2026"); // CLDR en-AU: no comma
  });
  it("Thai: the locale's own format with the Buddhist year (spec M4)", () => {
    expect(dateLine("2026-10-02", "th")).toBe("วันศุกร์ที่ 2 ตุลาคม 2569");
  });
});

describe("dateLocale (decision 89: browser region → profile country → en-US)", () => {
  it("uses the browser's locale for the UI language", () => {
    expect(dateLocale("en", "en-GB,en;q=0.9", "US")).toBe("en-GB");
    expect(dateLocale("en", "en-US,en;q=0.9", "GB")).toBe("en-US");
    expect(dateLocale("en", "fr-FR,en-AU;q=0.8,en;q=0.5", null)).toBe("en-AU");
    expect(dateLocale("en", "en;q=0.5,en-NZ;q=0.9", null)).toBe("en-NZ");
  });
  it("falls back to the profile's country, then en-US", () => {
    expect(dateLocale("en", "en", "GB")).toBe("en-GB");
    expect(dateLocale("en", "fr-FR", "au")).toBe("en-AU");
    expect(dateLocale("en", null, null)).toBe("en-US");
    expect(dateLocale("en", "*", "x1")).toBe("en-US");
  });
  it("ignores refused or malformed tags", () => {
    expect(dateLocale("en", "en-GB;q=0,en-US;q=0.5", null)).toBe("en-US");
    expect(dateLocale("en", "en-<script>", "GB")).toBe("en-GB");
    expect(dateLocale("en", "en-US-u-ca-buddhist", null)).toBe("en-US");
  });
  it("Thai stays Thai", () => {
    expect(dateLocale("th", "th-TH,en;q=0.8", "TH")).toBe("th-TH");
    expect(dateLocale("th", null, null)).toBe("th");
  });
});

describe("parseCheckIn (the same rules as upsert_check_in)", () => {
  it("mood only is a valid check-in", () => {
    expect(parseCheckIn(form({ mood: "3" }))).toEqual({ mood: 3, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null });
  });

  it("accepts the full card", () => {
    expect(parseCheckIn(form({ mood: "5", sleep_hours: "7.5", sleep_quality: "good", exercise_minutes: "90", stress: "2" }))).toEqual({
      mood: 5,
      sleep_hours: 7.5,
      sleep_quality: "good",
      exercise_minutes: 90,
      stress: 2,
    });
  });

  it("rejects anything out of range", () => {
    for (const bad of [
      {},
      { mood: "0" },
      { mood: "6" },
      { mood: "3", sleep_hours: "7.25" },
      { mood: "3", sleep_hours: "15" },
      { mood: "3", sleep_quality: "great" },
      { mood: "3", exercise_minutes: "20" },
      { mood: "3", stress: "6" },
      { mood: "3", stress: "x" },
    ] as Record<string, string>[]) {
      expect(parseCheckIn(form(bad)), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("checkInErrorAction (supabase/contracts/errors.md)", () => {
  it("maps the RPC's codes", () => {
    expect(checkInErrorAction("consent_required")).toEqual({ kind: "redirect", to: "/consent" });
    expect(checkInErrorAction("not_authenticated")).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(checkInErrorAction("date_in_future")).toEqual({ kind: "error", error: "dateInFuture" });
    expect(checkInErrorAction("stale_write")).toEqual({ kind: "error", error: "stale" });
    expect(checkInErrorAction("invalid_value")).toEqual({ kind: "error", error: "invalid" });
    expect(checkInErrorAction("not_found")).toEqual({ kind: "error", error: "generic" });
  });
});
