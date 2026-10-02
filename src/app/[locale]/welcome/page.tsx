import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Logo } from "@/components/Logo";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { WelcomeSlides } from "./WelcomeSlides";

// The first onboarding screen on the web (no Language step while one locale
// ships). Behind web-journal-live.
export async function generateMetadata({ params }: PageProps<"/[locale]/welcome">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return pageMetadata({ locale: locale as Locale, path: "/welcome", title: t("welcome1Title"), noindex: true });
}

export default async function WelcomePage({ params }: PageProps<"/[locale]/welcome">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();
  const tc = await getTranslations("common");

  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-[560px] flex-col items-center">
        <div className="mb-10 w-[120px]">
          <Logo variant="stacked" width={120} alt={tc("logoAlt")} />
        </div>
        {/* useSearchParams needs a Suspense boundary. */}
        <Suspense>
          <WelcomeSlides />
        </Suspense>
      </div>
    </main>
  );
}
