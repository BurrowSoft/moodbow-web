import type { MetadataRoute } from "next";

// Carried over from the Flutter site's web/manifest.json.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moodbow",
    short_name: "Moodbow",
    description: "A journal that learns your story.",
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
