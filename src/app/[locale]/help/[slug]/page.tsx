import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { findArticle, helpArticles, renderArticle } from "@/lib/helpContent";
import { pageMetadata } from "@/lib/metadata";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => helpArticles(locale).filter((a) => renderArticle(a) !== "").map((a) => ({ locale, slug: a.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/help/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = findArticle(locale, slug);
  if (!article) return {};
  return pageMetadata({ locale: locale as Locale, path: `/help/${slug}`, title: article.title, description: article.summary });
}

// One Help article, exactly as published (unmet pending blocks removed; an
// article with nothing left is a 404, like a missing one).
export default async function HelpArticlePage({ params }: PageProps<"/[locale]/help/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const article = findArticle(locale, slug);
  const html = article ? renderArticle(article) : "";
  if (!article || !html) notFound();
  const t = await getTranslations("help");
  return (
    <PageShell title={article.title} article>
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />
      <p>
        <Link href="/help" className="font-medium text-accent underline underline-offset-4">
          {t("helpTitle")}
        </Link>
      </p>
    </PageShell>
  );
}
