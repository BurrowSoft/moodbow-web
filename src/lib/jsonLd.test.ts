// @vitest-environment node
import { describe, expect, it } from "vitest";
import { jsonLdText, softwareApplication } from "./jsonLd";

const copy = { name: "Moodbow", description: "A private journal." };

describe("softwareApplication (launch SEO)", () => {
  it("nothing before any platform is live", () => {
    expect(softwareApplication({ web: false, play: false, appStore: false }, copy)).toBeNull();
  });

  it("only the live platforms; free; Lifestyle; no ratings", () => {
    const ld = softwareApplication({ web: true, play: true, appStore: false }, copy)!;
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Moodbow",
      description: "A private journal.",
      url: "https://www.moodbow.com/",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Android, Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    });
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(softwareApplication({ web: true, play: true, appStore: true }, copy)!.operatingSystem).toBe("Android, iOS, Web");
  });

  it("the text can't close its script element", () => {
    expect(jsonLdText({ name: "</script><b>" })).not.toContain("<");
    expect(JSON.parse(jsonLdText({ name: "</script>" }))).toEqual({ name: "</script>" });
  });
});
