import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale routing: en is unprefixed, th lives under /th. A first visit with a
// Thai browser goes to /th; the NEXT_LOCALE cookie remembers a choice made
// in the language switcher.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and any path with a dot (static files,
  // robots.txt, sitemap.xml, /.well-known/*).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
