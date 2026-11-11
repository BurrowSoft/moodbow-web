// @vitest-environment node
import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { APP_STORE_ID, APP_STORE_URL, appStoreUrl, liveStores, openAppFallback, openAppIntent, PLAY_URL } from "./stores";

describe("openAppIntent (decision 216, app PR C's moodbow://app/me/backup)", () => {
  it("the prod app on Production, the staging app elsewhere; the fallback encoded", () => {
    expect(openAppIntent(true, PLAY_URL)).toBe(
      "intent://app/me/backup#Intent;scheme=moodbow;package=com.burrowsoft.moodbow;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.burrowsoft.moodbow;end",
    );
    const page = "https://www.moodbow.com/th/email-confirmed?result=email_changed&app=missing";
    expect(openAppIntent(false, page)).toContain("package=com.burrowsoft.moodbow.staging;");
    expect(decodeURIComponent(openAppIntent(false, page).match(/S\.browser_fallback_url=([^;]+)/)![1])).toBe(page);
  });

  it("the fallback: this page without the button while Play isn't public; Play once play-live is met", () => {
    expect(openAppFallback(false, "https://www.moodbow.com/email-confirmed")).toBe("https://www.moodbow.com/email-confirmed?result=email_changed&app=missing");
    expect(openAppFallback(true, "https://www.moodbow.com/email-confirmed")).toBe(PLAY_URL);
  });
});

describe("liveStores (decision 185)", () => {
  it("each store by its own condition", () => {
    expect(liveStores(() => false)).toEqual({ play: false, appStore: false });
    expect(liveStores((id) => id === "play-live")).toEqual({ play: true, appStore: false });
  });

  it("the App Store never counts as live without its id (no dead links)", () => {
    expect(liveStores(() => true, null).appStore).toBe(false);
    expect(liveStores(() => true, "123").appStore).toBe(true);
    expect(liveStores(() => false, "123").appStore).toBe(false);
  });

  it("the two go live separately", () => {
    expect(liveStores((id) => id === "appstore-live", "123")).toEqual({ play: false, appStore: true });
    expect(liveStores(() => true, "123")).toEqual({ play: true, appStore: true });
  });

  it("the link comes from the id alone, with no country and nothing added", () => {
    expect(appStoreUrl("123")).toBe("https://apps.apple.com/app/id123");
    expect(APP_STORE_URL).toBe(APP_STORE_ID === null ? null : appStoreUrl(APP_STORE_ID));
  });

  // Launch-day guard: otherwise the flag does nothing, and the site quietly says "coming soon".
  it("appstore-live can't be met until APP_STORE_ID is set", () => {
    if (conditions["appstore-live"].met) expect(APP_STORE_ID).not.toBeNull();
  });

  it("the Play link is the listing; both conditions exist and are unmet until launch", () => {
    expect(PLAY_URL).toBe("https://play.google.com/store/apps/details?id=com.burrowsoft.moodbow");
    expect(conditions).toHaveProperty("play-live");
    expect(conditions).toHaveProperty("appstore-live");
  });
});
