"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import { localKey } from "@/lib/localData";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";

const noSubscribe = () => () => {};

// A security update (specs/breach-procedure-draft.md): the server names the current one, and this
// browser remembers it was read, per person and per update, so a new one shows again and another
// browser shows it too, which is the right way for this to fail. The words don't say what
// happened: the public page does, and it's written at the time. Nothing shows until the browser
// knows it hasn't been read. Blocked storage shows it each time.
export function SecurityNotice({ id, uid }: { id: string; uid: string }) {
  const t = useTranslations("common");
  const key = localKey("security-notice-read", uid, id);
  const stored = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return window.localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [read, setRead] = useState(false);
  if (stored || read) return null;
  return (
    <section data-testid="security-notice" className={`${JOURNAL_CARD} [font-size:min(1rem,max(8vw,16px))] print:hidden`}>
      <p role="status" className="font-medium text-text">
        {t("securityNotice")}
      </p>
      <div className="mt-[12px] [&_a]:min-h-[44px]">
        <Link
          href="/security"
          data-testid="security-notice-read"
          className={dialogButton(true)}
          onClick={() => {
            try {
              window.localStorage.setItem(key, "1");
            } catch {
              // Storage is blocked: it shows again next time.
            }
            setRead(true);
          }}
        >
          {t("securityNoticeRead")}
        </Link>
      </div>
    </section>
  );
}
