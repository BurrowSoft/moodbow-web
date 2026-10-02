import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";

// Fallback for requests that never reach a locale (the proxy routes almost
// everything to [locale], so this is rare): the default locale's text.
export default async function RootNotFound() {
  const locale = routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "notFound" });
  return (
    <html lang={locale} className={fontVariables}>
      <body className="flex min-h-dvh flex-col items-center justify-center px-6 text-center font-sans">
        <h1 className="text-3xl font-medium">{t("title")}</h1>
        <p className="mt-4 text-muted">
          <Link href="/" className="font-medium text-accent underline underline-offset-4">
            {t("home")}
          </Link>
        </p>
      </body>
    </html>
  );
}
