import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GetHelpNow } from "./SafetyCard";

// Shown by a journal page when there's no session any more, reached by moving
// between tabs: the shared layout, which would send them to sign-in, doesn't
// run again. Says what happened, not "Something went wrong": Try again could
// only end up at sign-in anyway (Web Tester row, UX). Nothing is changed or
// deleted; drafts in this browser stay for when they sign back in. The exception to "Today
// always keeps check-in and Write" (specs/next-release.md): with no session there's no account
// to save to, and this browser may be someone else's next. Help stays.
export function SessionEnded() {
  const t = useTranslations("auth");
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center" data-testid="session-ended">
      <div role="alert" data-alert="heading">
        <h1 className="text-lg font-medium text-text">{t("sessionEndedTitle")}</h1>
      </div>
      <Link href="/sign-in" data-testid="session-ended-sign-in" className="mt-6 inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent">
        {t("signinSubmit")}
      </Link>
      <div className="mt-4">
        <GetHelpNow country={null} testId="session-ended-help" neutral />
      </div>
    </section>
  );
}
