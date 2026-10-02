import { getTranslations } from "next-intl/server";

// An empty tab, like the app's M1 skeleton: the tab title and "Coming soon".
// Each tab fills in with its own release item (Today = M4, Timeline = M5…).
export async function TabPlaceholder({ titleKey, children }: { titleKey: "tabToday" | "tabTimeline" | "tabInsights" | "tabMe"; children?: React.ReactNode }) {
  const t = await getTranslations("app");
  return (
    <section>
      <h1 className="text-3xl font-medium tracking-tight">{t(titleKey)}</h1>
      <p className="mt-4 text-muted">{t("emptyComingSoon")}</p>
      {children}
    </section>
  );
}

export async function tabMetadata(titleKey: "tabToday" | "tabTimeline" | "tabInsights" | "tabMe", locale: string) {
  const t = await getTranslations({ locale, namespace: "app" });
  const meta = await getTranslations({ locale, namespace: "meta" });
  return { title: meta("pageTitle", { title: t(titleKey) }), robots: { index: false, follow: false } };
}
