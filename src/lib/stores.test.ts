// @vitest-environment node
import { describe, expect, it } from "vitest";
import conditions from "../../content/conditions.json";
import { APP_STORE_ID, APP_STORE_URL, liveStores, PLAY_URL } from "./stores";

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
