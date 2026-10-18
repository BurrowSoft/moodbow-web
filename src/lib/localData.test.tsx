import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDataWipe } from "@/components/LocalDataWipe";
import { localKey, wipeCookieUid, wipeLocalData } from "./localData";

const GONE = "0b5f2c1e-7d3a-4e8b-9c41-2a6f8e1d3b70";
const OTHER = "9a1d4c3b-2e5f-4a6b-8c7d-1e2f3a4b5c6d";

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(localKey("pending-checkin", GONE), "a");
  window.localStorage.setItem(localKey("draft-entry", GONE, "new"), "b");
  window.localStorage.setItem(localKey("pending-checkin", OTHER), "c");
  window.localStorage.setItem("NEXT_LOCALE", "en");
});
afterEach(() => {
  cleanup();
  document.cookie = "mb_wipe=; Max-Age=0; Path=/";
});

const keys = () => Object.keys(window.localStorage).sort();

describe("wipeLocalData (decision 85)", () => {
  it("removes every mb:*:<uid> key of that user, and nothing else", () => {
    wipeLocalData(window.localStorage, GONE);
    expect(keys()).toEqual(["NEXT_LOCALE", `mb:pending-checkin:${OTHER}`]);
  });
});

describe("wipeCookieUid", () => {
  it("reads only a well-formed uid", () => {
    expect(wipeCookieUid(`a=1; mb_wipe=${GONE}; b=2`)).toBe(GONE);
    expect(wipeCookieUid("mb_wipe=not-a-uid")).toBeNull();
    expect(wipeCookieUid("a=1")).toBeNull();
  });
});

describe("LocalDataWipe", () => {
  it("wipes the named user's copies and deletes the cookie at once", () => {
    document.cookie = `mb_wipe=${GONE}; Path=/`;
    render(<LocalDataWipe />);
    expect(keys()).toEqual(["NEXT_LOCALE", `mb:pending-checkin:${OTHER}`]);
    expect(document.cookie).not.toContain("mb_wipe=");
  });

  it("does nothing without the cookie", () => {
    render(<LocalDataWipe />);
    expect(keys()).toHaveLength(4);
  });
});
