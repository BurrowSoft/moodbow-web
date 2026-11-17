// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// What the iPhone app may open from moodbow.com (UX & PM, 17 Nov): /open/*
// only. Sign-in, sign-up and reset links (/auth/*) and the confirmation page
// stay in the browser that asked for them, so a web sign-up never lands in
// the app. Apple reads the components in order and the first match wins, so
// every exclusion comes before the one claim.
const aasa = JSON.parse(readFileSync(join(__dirname, "..", "..", "public", ".well-known", "apple-app-site-association"), "utf8")) as {
  applinks: { details: { appIDs: string[]; components: { "/": string; exclude?: boolean }[] }[] };
};

describe("apple-app-site-association", () => {
  const [detail] = aasa.applinks.details;

  it("one app, claiming /open/* and nothing else", () => {
    expect(aasa.applinks.details).toHaveLength(1);
    const claims = detail.components.filter((c) => !c.exclude).map((c) => c["/"]);
    expect(claims).toEqual(["/open/*"]);
  });

  it("the auth links and the confirmation page are excluded, with or without a locale, before the claim", () => {
    const excluded = detail.components.filter((c) => c.exclude).map((c) => c["/"]);
    expect(excluded).toEqual(["/auth/*", "/*/auth/*", "/email-confirmed", "/*/email-confirmed"]);
    const claimAt = detail.components.findIndex((c) => !c.exclude);
    expect(detail.components.slice(claimAt + 1)).toEqual([]);
  });

  // ⛔ Red on purpose until the real ids are in: Vitor's Team ID and the
  // iPhone app's bundle id (the Mobile Dev). A placeholder must never ship.
  it("the app id is a real Team ID and bundle id", () => {
    for (const id of detail.appIDs) expect(id).toMatch(/^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/);
  });
});
