"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ShareNote } from "@/lib/share/shareLinks";
import { markShareSeen } from "./me/share/actions";

// Today's quiet notes about share links (1.4 G; UX's coercion defence): a link was created, a link
// was opened for the first time. Each says where to stop it, with "See links" and "Got it". Got it
// records the seen in the database (share_mark_seen), so the note shows on whichever device comes
// next until then, the app included. A failed save keeps the note for next time.
export function ShareNotes({ notes }: { notes: ShareNote[] }) {
  const t = useTranslations("shareMe");
  const [shown, setShown] = useState(notes);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-3">
      {shown.map((n) => (
        <section key={`${n.kind}-${n.id}`} data-testid={`share-note-${n.kind}`} aria-live="polite" className="space-y-2 rounded-2xl bg-pill px-[16px] py-[12px]">
          <p className="text-text">{n.kind === "created" ? t("noteCreated") : t("noteFirstView")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/app/me/share" data-testid={`share-note-${n.kind}-see`} className="inline-flex min-h-[44px] items-center font-medium text-accent underline underline-offset-4">
              {t("noteSee")}
            </Link>
            <button
              type="button"
              data-testid={`share-note-${n.kind}-ok`}
              onClick={() => {
                setShown((now) => now.filter((x) => x !== n));
                void markShareSeen(n.id, n.kind).catch(() => false);
              }}
              className="inline-flex min-h-[44px] items-center font-medium text-text underline underline-offset-4"
            >
              {t("noteGotIt")}
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
