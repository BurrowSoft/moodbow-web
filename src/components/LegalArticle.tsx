import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageShell } from "./PageShell";
import { pageGate, type ConditionId } from "@/lib/conditions";
import { legalLocale, legalSource, renderLegal, type LegalSlug } from "@/lib/legalContent";

type Props = { slug: LegalSlug; locale: string; gate: ConditionId };

// The privacy policy or terms from content/legal/<locale>/<slug>.md. The
// article shows exactly what Production would show (unmet pending blocks
// removed). On a draft build (Preview / CI), a panel after the article lists
// the hidden blocks so reviewers can read them; it never reaches Production
// (the page is a 404 there until its condition is met).
// The legal text exists in English only (decision 164): another language's
// page shows it under one line in that language (legalEnglishOnly), marked
// lang="en". Its gate is the same in every language (the proxy checks the
// path without its locale).
export async function LegalArticle({ slug, locale, gate }: Props) {
  const state = pageGate(gate);
  if (state === "hidden") notFound();
  const textLocale = legalLocale(locale);
  const { title, html, hidden } = renderLegal(legalSource(slug, textLocale));
  const t = await getTranslations("legal");
  const english = textLocale !== locale;

  const panel =
    state === "draft" && hidden.length > 0 ? (
      <aside data-testid="legal-hidden" className="mx-auto mt-10 max-w-2xl rounded-2xl border border-dashed border-border px-5 py-4 text-sm">
        <h2 className="font-medium text-text">{t("hiddenTitle")}</h2>
        <ul className="mt-3 space-y-3">
          {hidden.map((block, i) => (
            <li key={`${block.id}-${i}`}>
              <code className="rounded bg-pill px-1.5 py-0.5 text-xs text-accent">{block.id}</code>
              <p className="mt-1 whitespace-pre-wrap text-muted">{block.text}</p>
            </li>
          ))}
        </ul>
      </aside>
    ) : null;

  return (
    <PageShell title={title} draft={state === "draft"} article after={panel} notice={english ? t("legalEnglishOnly") : undefined} lang={english ? textLocale : undefined}>
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </PageShell>
  );
}
