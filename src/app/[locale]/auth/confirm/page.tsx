import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PageShell } from "@/components/PageShell";
import { parseConfirmLink, type ConfirmType } from "@/lib/authConfirm";
import { pageMetadata } from "@/lib/metadata";
import { confirmLink } from "./actions";

// Where auth email links land: /auth/confirm?token_hash=…&type=…
// GET only shows one button. It never calls Supabase, so link scanners
// can't spend the token; the click (a POST, ./actions.ts) verifies it.
// noindex; next.config sends Referrer-Policy: same-origin for /auth/*.
export const dynamic = "force-dynamic";

// Copy per link type. invite / magiclink / email aren't sent by the R1 hook
// flows; they read like a plain email confirmation.
const COPY: Record<ConfirmType, { title: string; body: string; button: string }> = {
  signup: { title: "signupTitle", body: "signupBody", button: "signupButton" },
  invite: { title: "signupTitle", body: "signupBody", button: "signupButton" },
  magiclink: { title: "signupTitle", body: "signupBody", button: "signupButton" },
  email: { title: "signupTitle", body: "signupBody", button: "signupButton" },
  recovery: { title: "recoveryTitle", body: "recoveryBody", button: "recoveryButton" },
  email_change: { title: "emailChangeTitle", body: "emailChangeBody", button: "emailChangeButton" },
};

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/confirm">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "confirmLink" });
  return pageMetadata({ locale: locale as Locale, path: "/auth/confirm", title: t("signupTitle"), noindex: true });
}

export default async function ConfirmLinkPage({ params, searchParams }: PageProps<"/[locale]/auth/confirm">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const query = await searchParams;
  const link = parseConfirmLink(
    new URLSearchParams({ token_hash: String(query.token_hash ?? ""), type: String(query.type ?? "") }),
  );

  if (!link) {
    const t = await getTranslations("emailConfirmed");
    return (
      <PageShell title={t("errorTitle")}>
        <p data-testid="confirm-invalid">{t("errorBody")}</p>
      </PageShell>
    );
  }

  const t = await getTranslations("confirmLink");
  const copy = COPY[link.type];
  return (
    <PageShell title={t(copy.title)}>
      <p>{t(copy.body)}</p>
      <form action={confirmLink}>
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <input type="hidden" name="type" value={link.type} />
        <button
          type="submit"
          className="inline-flex min-h-[52px] min-w-[200px] items-center justify-center rounded-full bg-accent px-8 py-3.5 text-base font-medium text-on-accent hover:opacity-90"
        >
          {t(copy.button)}
        </button>
      </form>
    </PageShell>
  );
}
