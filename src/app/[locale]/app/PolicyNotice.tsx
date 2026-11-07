"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";
import { dismissPolicyNotice } from "./actions";

// Once, for a privacy change that's coming. It blocks nothing, and it goes as soon as it's
// dismissed: if saving that fails, it comes back next time, which is the honest result.
// Under the safety card's cap (UX): nobody gets 3 to 4 screens of a notice at 300 %.
export function PolicyNotice({ id, date }: { id: string; date: string | null }) {
  const t = useTranslations("app");
  const router = useRouter();
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <section aria-labelledby="policy-notice-title" data-testid="policy-notice" className={`mb-6 ${JOURNAL_CARD} [font-size:min(1rem,max(8vw,16px))] print:hidden`}>
      <h2 id="policy-notice-title" className="font-medium leading-[1.556] text-text [font-size:min(1.125rem,max(9vw,18px))]">
        {t("policyNoticeTitle")}
      </h2>
      <p className="mt-1 text-text">
        {t("policyNoticeBody")}
        {date && ` ${t("policyNoticeApplies", { date })}`}
      </p>
      <div className="mt-[12px] flex flex-wrap items-center gap-[12px]">
        <Link href="/privacy/next" data-testid="policy-notice-read" className="inline-flex min-h-11 max-w-full items-center font-medium text-accent underline underline-offset-4 [overflow-wrap:anywhere]">
          {t("policyNoticeRead")}
        </Link>
        <button
          type="button"
          data-testid="policy-notice-dismiss"
          onClick={() => {
            setShown(false);
            void dismissPolicyNotice(id)
              .then(({ changed }) => {
                // Once, on this click only: no error and no loop.
                if (changed) router.refresh();
              })
              .catch(() => {});
          }}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-[16px] font-medium text-text hover:bg-pill"
        >
          {t("policyNoticeDismiss")}
        </button>
      </div>
    </section>
  );
}
