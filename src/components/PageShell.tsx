import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";

type Props = {
  title: string;
  // A draft page (condition not met, outside Production) shows a banner.
  draft?: boolean;
  // Long-form bodies (legal, account deletion, Help articles) are marked
  // data-content="article" so the tester's strings check can tell them
  // from UI chrome.
  article?: boolean;
  // Rendered after the article, outside it (e.g. a draft-only panel).
  after?: React.ReactNode;
  // A line above the article in the page's language (legal in English on a
  // /th page: legalEnglishOnly), and the article's own language when it
  // differs from the page's.
  notice?: React.ReactNode;
  lang?: string;
  children: React.ReactNode;
};

// Layout for the inner pages: the horizontal logo linking home, an optional
// draft banner, and a readable text column.
export async function PageShell({ title, draft = false, article = false, after, notice, lang, children }: Props) {
  const t = await getTranslations("common");
  return (
    <>
      {draft && (
        <p data-testid="draft-banner" className="bg-draft-bg px-6 py-3 text-center text-sm font-medium text-draft-text">
          {t("draftBanner")}
        </p>
      )}
      <header className="px-6 pt-6">
        <div className="mx-auto max-w-2xl">
          <Link href="/" aria-label={t("homeAria")} className="inline-block rounded-md">
            <Logo variant="horizontal" width={140} alt="" />
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1 px-6 py-10">
        {notice && (
          <p data-testid="page-notice" className="mx-auto mb-6 max-w-2xl rounded-2xl bg-pill px-5 py-3 text-sm font-medium text-text">
            {notice}
          </p>
        )}
        <article lang={lang} className="mx-auto max-w-2xl">
          <h1 className="text-balance text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
          <div data-content={article ? "article" : undefined} className="mt-6 space-y-5 text-base leading-relaxed text-muted sm:text-[17px]">{children}</div>
        </article>
        {after}
      </main>
    </>
  );
}
