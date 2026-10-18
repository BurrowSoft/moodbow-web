import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { helpIndex } from "@/lib/helpContent";
import { pageMetadata } from "@/lib/metadata";
import { SUPPORT_EMAIL } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/help">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help" });
  return pageMetadata({ locale: locale as Locale, path: "/help", title: t("helpTitle"), description: t("helpIntro", { email: SUPPORT_EMAIL }) });
}

// An id from a topic name ("Privacy & account" → "topic-privacy-account").
const topicId = (topic: string) => `topic-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

// Help & FAQ (item 8): the published articles by topic (content/help).
export default async function HelpPage({ params }: PageProps<"/[locale]/help">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("help");
  return (
    <PageShell title={t("helpTitle")}>
      <p>{t("helpIntro", { email: SUPPORT_EMAIL })}</p>
      {helpIndex(locale).map(({ topic, articles }) => (
        <section key={topic} aria-labelledby={topicId(topic)} className="pt-4">
          <h2 id={topicId(topic)} className="text-lg font-medium text-text">
            {topic}
          </h2>
          <ul className="mt-3 space-y-3">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link href={`/help/${a.slug}`} data-testid={`help-${a.slug}`} className="font-medium text-accent underline underline-offset-4">
                  {a.title}
                </Link>
                <p className="text-sm">{a.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
