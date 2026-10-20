import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { liveStores, PLAY_PACKAGE, PLAY_URL } from "@/lib/stores";

// Carried over from the Flutter site's web/manifest.json. The manifest has
// one language: the default locale's. Once the Play listing is live
// (play-live, decision 185) it names the app too; prefer_related_applications
// stays false: the web journal is a full product on its own (UX).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "meta" });
  return {
    name: t("siteName"),
    short_name: t("siteName"),
    description: t("manifestDescription"),
    start_url: "/",
    display: "standalone",
    background_color: "#FBF6F1",
    theme_color: "#FBF6F1",
    icons: [
      { src: "/icons/Icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/Icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/Icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/Icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    ...(liveStores().play
      ? { related_applications: [{ platform: "play", url: PLAY_URL, id: PLAY_PACKAGE }], prefer_related_applications: false }
      : {}),
  };
}
