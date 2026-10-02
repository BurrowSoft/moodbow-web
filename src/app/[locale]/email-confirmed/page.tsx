import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Logo } from "@/components/Logo";
import { liveFeatures } from "@/lib/liveFeatures";
import { pageMetadata } from "@/lib/metadata";
import { EmailConfirmedMessage } from "./EmailConfirmedMessage";

// Where Supabase's confirm-email links land. Never indexed: the URL can
// carry tokens.
export async function generateMetadata({ params }: PageProps<"/[locale]/email-confirmed">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "emailConfirmed" });
  return pageMetadata({ locale: locale as Locale, path: "/email-confirmed", title: t("metaTitle"), noindex: true });
}

export default async function EmailConfirmedPage({ params }: PageProps<"/[locale]/email-confirmed">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("emailConfirmed");
  const tc = await getTranslations("common");

  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-[560px] flex-col items-center">
        <div className="mb-10 w-[120px]">
          <Logo variant="stacked" width={120} alt={tc("logoAlt")} />
        </div>
        <EmailConfirmedMessage showContinue={liveFeatures.webJournal} />
        <noscript>
          <h1 className="text-center text-[28px] font-medium">{t("successTitle")}</h1>
          <p className="mt-4 text-center text-muted">{t("successBody")}</p>
        </noscript>
      </div>
    </main>
  );
}
