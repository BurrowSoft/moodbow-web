// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { campaignFrom, campaignQuery, currentCampaign, playLink, rememberCampaign, resetCampaign } from "./campaign";
import { PLAY_URL } from "./stores";

beforeEach(resetCampaign);

describe("campaignFrom: our own three labels only (decision 79)", () => {
  it("utm_source / utm_medium / utm_campaign; everything else dropped", () => {
    expect(campaignFrom("?utm_source=ig&utm_medium=story&utm_campaign=launch-1&utm_term=x&utm_content=y&gclid=abc&ref=me")).toEqual({
      utm_source: "ig",
      utm_medium: "story",
      utm_campaign: "launch-1",
    });
    expect(campaignFrom("?utm_campaign=oct_2026.v2")).toEqual({ utm_campaign: "oct_2026.v2" });
  });

  it("a value that isn't a label of ours is dropped (an email, spaces, a long token)", () => {
    expect(campaignFrom("?utm_source=a%40b.com")).toBeNull();
    expect(campaignFrom("?utm_source=two words")).toBeNull();
    expect(campaignFrom(`?utm_source=${"x".repeat(65)}`)).toBeNull();
    expect(campaignFrom("?utm_source=ok&utm_medium=%3Cscript%3E")).toEqual({ utm_source: "ok" });
  });

  it("no labels: null", () => {
    expect(campaignFrom("")).toBeNull();
    expect(campaignFrom("?page=2")).toBeNull();
  });
});

describe("the landing page's campaign, first touch, in memory", () => {
  it("the first page's labels are kept; a later page can't replace them", () => {
    rememberCampaign("?utm_source=ig&utm_campaign=launch");
    rememberCampaign("?utm_source=newsletter");
    expect(currentCampaign()).toEqual({ utm_source: "ig", utm_campaign: "launch" });
  });

  it("a landing page without labels: none, even if a later page has some", () => {
    rememberCampaign("");
    rememberCampaign("?utm_source=ig");
    expect(currentCampaign()).toBeNull();
  });
});

describe("the Play link's install referrer", () => {
  it("no campaign: the plain listing link", () => {
    expect(playLink(PLAY_URL, null)).toBe(PLAY_URL);
  });

  it("a campaign: &referrer= with the labels, URL-encoded, in a fixed order", () => {
    expect(playLink(PLAY_URL, { utm_campaign: "launch", utm_source: "ig" })).toBe(`${PLAY_URL}&referrer=utm_source%3Dig%26utm_campaign%3Dlaunch`);
    expect(campaignQuery({ utm_medium: "story", utm_source: "ig" })).toBe("utm_source=ig&utm_medium=story");
  });
});
