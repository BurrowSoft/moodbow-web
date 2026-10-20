import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetCampaign } from "@/lib/campaign";
import { PLAY_URL } from "@/lib/stores";
import { PlayStoreLink } from "./PlayStoreLink";

// The landing page's campaign goes on the Play link as the install
// referrer (decision 79): from the address, in memory only.
beforeEach(resetCampaign);
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const link = () => screen.getByTestId("play");

describe("PlayStoreLink", () => {
  it("landed with our campaign labels: the referrer carries them (and nothing else from the address)", () => {
    window.history.replaceState(null, "", "/?utm_source=ig&utm_campaign=launch&gclid=x&email=a%40b.com");
    render(<PlayStoreLink testId="play">Google Play</PlayStoreLink>);
    expect(link()).toHaveAttribute("href", `${PLAY_URL}&referrer=utm_source%3Dig%26utm_campaign%3Dlaunch`);
    expect(link()).toHaveTextContent("Google Play");
  });

  it("landed without them: the plain listing link", () => {
    render(<PlayStoreLink testId="play">Google Play</PlayStoreLink>);
    expect(link()).toHaveAttribute("href", PLAY_URL);
  });

  it("nothing is kept in storage or cookies", () => {
    window.history.replaceState(null, "", "/?utm_source=ig");
    render(<PlayStoreLink testId="play">Google Play</PlayStoreLink>);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });
});
