import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Logo } from "@/components/Logo";
import { fontVariables } from "@/lib/fonts";

// Every 404: unmatched URLs, and hidden gated pages (the proxy rewrites
// those here). Rendered outside [locale], so it resolves the default
// locale's text itself. The <title> is hoisted into <head> by React.
export default async function RootNotFound() {
  const locale = routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "notFound" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const tm = await getTranslations({ locale, namespace: "meta" });
  const link = "font-medium text-accent underline underline-offset-4";
  return (
    <html lang={locale} className={fontVariables}>
      <body className="flex min-h-dvh flex-col font-sans">
        <title>{tm("pageTitle", { title: t("title") })}</title>
        <header className="px-6 pt-6">
          <div className="mx-auto max-w-2xl">
            <Link href="/" aria-label={tc("homeAria")} className="inline-block rounded-md">
              <Logo variant="horizontal" width={140} alt="" />
            </Link>
          </div>
        </header>
        <main id="main" className="flex-1 px-6 py-10">
          <article className="mx-auto max-w-2xl">
            <h1 className="text-balance text-3xl font-medium tracking-tight sm:text-4xl">{t("title")}</h1>
            <div className="mt-6 space-y-5 text-base leading-relaxed text-muted sm:text-[17px]">
              <p>{t("body")}</p>
              <p className="flex flex-wrap gap-x-6 gap-y-2">
                <Link href="/" className={link}>
                  {t("home")}
                </Link>
                <Link href="/support" className={link}>
                  {tc("support")}
                </Link>
              </p>
            </div>
          </article>
        </main>
      </body>
    </html>
  );
}
