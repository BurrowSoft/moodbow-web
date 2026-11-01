// @vitest-environment node
import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { APP_STORE_ID, APP_STORE_URL, liveStores, openAppIntent, PLAY_URL } from "./stores";

describe("openAppIntent (decision 216, app PR C's moodbow://app/me/backup)", () => {
  it("the prod app on Production, the staging app elsewhere; Play as the fallback", () => {
    expect(openAppIntent(true)).toBe(
      "intent://app/me/backup#Intent;scheme=moodbow;package=com.burrowsoft.moodbow;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.burrowsoft.moodbow;end",
    );
    expect(openAppIntent(false)).toContain("package=com.burrowsoft.moodbow.staging;");
    expect(decodeURIComponent(openAppIntent(false).match(/S\.browser_fallback_url=([^;]+)/)![1])).toBe(PLAY_URL);
  });
});

describe("liveStores (decision 185)", () => {
  it("each store by its own condition", () => {
    expect(liveStores(() => false)).toEqual({ play: false, appStore: false });
    expect(liveStores((id) => id === "play-live")).toEqual({ play: true, appStore: false });
  });

  it("the App Store never counts as live without its link and id (no dead links)", () => {
    if (APP_STORE_URL === null || APP_STORE_ID === null) expect(liveStores(() => true).appStore).toBe(false);
    else expect(liveStores(() => true).appStore).toBe(true);
  });

  it("the Play link is the listing; both conditions exist and are unmet until launch", () => {
    expect(PLAY_URL).toBe("https://play.google.com/store/apps/details?id=com.burrowsoft.moodbow");
    expect(conditions).toHaveProperty("play-live");
    expect(conditions).toHaveProperty("appstore-live");
  });
});
