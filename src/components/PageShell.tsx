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
  // Directly under the heading, above the body.
  underTitle?: React.ReactNode;
  // The space above the heading in px, so at large text it doesn't push what's under the heading off
  // the first screen (help's numbers: 72 and 120 px at 300 %). The same at the normal size.
  tightTop?: boolean;
  lang?: string;
  // A page whose type stops growing at about 200 % on narrow screens (decision 231): the title, the
  // notice and the body, below the rem-based wide layout.
  capTitle?: boolean;
  children: React.ReactNode;
};

// Layout for the inner pages: the horizontal logo linking home, an optional
// draft banner, and a readable text column.
export async function PageShell({ title, draft = false, article = false, after, notice, underTitle, tightTop = false, lang, capTitle = false, children }: Props) {
  const t = await getTranslations("common");
  return (
    <>
      {draft && (
        <p data-testid="draft-banner" className="bg-draft-bg px-6 py-3 text-center text-sm font-medium text-draft-text">
          {t("draftBanner")}
        </p>
      )}
      <header className={`px-6 ${tightTop ? "pt-[24px]" : "pt-6"}`}>
        <div className="mx-auto max-w-2xl">
          <Link href="/" aria-label={t("homeAria")} className="inline-block rounded-md">
            <Logo variant="horizontal" width={140} alt="" />
          </Link>
        </div>
      </header>
      <main id="main" className={`flex-1 px-[24px] [overflow-wrap:anywhere] ${tightTop ? "pt-[40px] pb-10" : "py-10"}`}>
        {notice && (
          <p data-testid="page-notice" className={`mx-auto mb-6 max-w-2xl rounded-2xl bg-pill px-5 py-3 font-medium text-text ${capTitle ? "leading-[1.429] [font-size:min(0.875rem,max(8.75vw,28px))]" : "text-sm"}`}>
            {notice}
          </p>
        )}
        <article lang={lang} className="mx-auto max-w-2xl">
          {/* Capped on a narrow screen at large text, so a first-run page's ordinary words stay
              whole at 200 %, and never smaller than the body under it. The same size and line
              height as text-3xl and text-4xl otherwise. */}
          <h1 className={`text-balance font-medium leading-[1.2] tracking-tight sm:text-4xl sm:leading-[2.5rem] ${capTitle ? "[font-size:min(1.875rem,max(12vw,32px))]" : "[font-size:min(1.875rem,max(12vw,30px,1rem))]"}`}>{title}</h1>
          {underTitle}
          <div data-content={article ? "article" : undefined} className={`mt-6 space-y-5 text-base leading-relaxed text-muted sm:text-[1.0625rem] ${capTitle ? "max-sm:[font-size:min(1rem,max(10vw,32px))]" : ""}`}>{children}</div>
        </article>
        {after}
      </main>
    </>
  );
}
