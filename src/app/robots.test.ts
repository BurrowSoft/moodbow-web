// @vitest-environment node
import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt (launch SEO)", () => {
  it("public pages allowed; the journal and the auth links disallowed; the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/app/", "/auth/"] },
      sitemap: "https://www.moodbow.com/sitemap.xml",
      host: "https://www.moodbow.com",
    });
  });
});
