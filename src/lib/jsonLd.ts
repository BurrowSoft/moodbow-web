import { SITE_URL } from "./site";

// schema.org SoftwareApplication for the home page (launch SEO, UX & PM).
// Only the platforms that are really live are named, and nothing at all is
// said before one is (a listing for an app nobody can install yet would be
// false). Free; no ratings.
export type LivePlatforms = { web: boolean; play: boolean; appStore: boolean };

export function softwareApplication(live: LivePlatforms, { name, description }: { name: string; description: string }): Record<string, unknown> | null {
  const os = [live.play && "Android", live.appStore && "iOS", live.web && "Web"].filter(Boolean) as string[];
  if (os.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    url: `${SITE_URL}/`,
    applicationCategory: "LifestyleApplication",
    operatingSystem: os.join(", "),
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}

// Safe inside a <script> element: no "</script>" (or any "<") can end it early.
export const jsonLdText = (data: Record<string, unknown>) => JSON.stringify(data).replace(/</g, "\\u003c");
