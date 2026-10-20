// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The home page's metadata before and after launch (UX): the "Coming soon"
// description and image until the web journal is live, then the launch copy
// and /og-launch.png.
let live = false;
vi.mock("./conditions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conditions")>()),
  conditionMet: (id: string) => id === "web-journal-live" && live,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: keyof typeof messages.meta, values?: { title: string }) =>
    key === "pageTitle" && values ? messages.meta.pageTitle.replace("{title}", values.title) : messages.meta[key],
}));
const { pageMetadata } = await import("./metadata");

const og = (m: Awaited<ReturnType<typeof pageMetadata>>) => m.openGraph as { description: string; images: { url: string; alt: string }[] };

describe("pageMetadata: launch copy", () => {
  it("before launch: the Coming soon description and image", async () => {
    live = false;
    const m = await pageMetadata({ locale: "en", path: "/" });
    expect(m.description).toBe(messages.meta.description);
    expect(og(m).description).toBe(messages.meta.ogDescription);
    expect(og(m).images[0]).toMatchObject({ url: "https://www.moodbow.com/og-image.png", alt: messages.meta.ogImageAlt });
  });

  it("once the web journal is live: the launch copy and the launch image, with its own alt", async () => {
    live = true;
    const m = await pageMetadata({ locale: "en", path: "/" });
    expect(m.description).toBe(messages.meta.descriptionLaunch);
    expect(og(m).description).toBe(messages.meta.ogDescriptionLaunch);
    expect(og(m).images[0]).toMatchObject({ url: "https://www.moodbow.com/og-launch.png", alt: messages.meta.ogImageAltLaunch });
    expect((m.twitter as { images: string[] }).images).toEqual(["https://www.moodbow.com/og-launch.png"]);
    for (const text of [m.description, og(m).description, og(m).images[0].alt]) expect(text).not.toMatch(/coming soon/i);
  });

  it("a page with its own description keeps it, before and after", async () => {
    live = true;
    const m = await pageMetadata({ locale: "en", path: "/support", title: "Support", description: "Help." });
    expect(m.description).toBe("Help.");
    expect(og(m).description).toBe("Help.");
  });
});
