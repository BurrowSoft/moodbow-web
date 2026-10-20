import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { pickMessages, PUBLIC_CLIENT_NAMESPACES } from "@/i18n/clientMessages";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { SITE_URL } from "@/lib/site";
import { Footer } from "@/components/Footer";
import { LocalDataWipe } from "@/components/LocalDataWipe";
import { VisitCounts } from "@/components/VisitCounts";
import { THEME_PRE_PAINT } from "@/lib/appearance";
import { conditionMet } from "@/lib/conditions";
import { NONCE_HEADER } from "@/lib/csp";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: t("siteName"),
    appleWebApp: { title: t("siteName") },
    icons: ICONS,
  };
}

// /favicon.ico comes from src/app/favicon.ico, which Next links itself.
const ICONS: Metadata["icons"] = {
  icon: [
    { url: "/favicon.svg", type: "image/svg+xml" },
    { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
  ],
  apple: "/apple-touch-icon.png",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF6F1" },
    { media: "(prefers-color-scheme: dark)", color: "#2B2438" },
  ],
  colorScheme: "light dark",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common" });
  // The CSP nonce for this request (proxy.ts): the pre-paint script is inline.
  // Reading it renders every page per request, as a nonce requires.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    // data-theme is set by the pre-paint script before React runs, so the
    // server HTML can't know it (suppressHydrationWarning, <html> only).
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Me → Appearance on this device (decision 133), before first paint. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_PRE_PAINT }} />
      </head>
      <body className="flex min-h-dvh flex-col font-sans">
        <a
          href="#main"
          className="sr-only rounded-full bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          {t("skipToContent")}
        </a>
        {/* Only the namespaces client components use outside the journal reach
            the browser here (perf fix 3); /app's layout adds the rest. */}
        <NextIntlClientProvider messages={pickMessages(await getMessages(), PUBLIC_CLIENT_NAMESPACES)}>
          <LocalDataWipe />
          <div className="fade-in flex flex-1 flex-col">
            {children}
            <Footer />
          </div>
        </NextIntlClientProvider>
        {/* Cookie-free visit counts (decision 79): only once the privacy
            policy says so, in the same deploy ("web-analytics"). */}
        {conditionMet("web-analytics") && <VisitCounts />}
      </body>
    </html>
  );
}
