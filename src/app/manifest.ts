import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

// Carried over from the Flutter site's web/manifest.json. The manifest has
// one language: the default locale's.
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
  };
}
