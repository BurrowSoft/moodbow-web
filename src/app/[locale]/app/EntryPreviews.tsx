import { getTranslations } from "next-intl/server";
import { MomentStar } from "@/components/MomentStar";
import { Link } from "@/i18n/navigation";
import { preview } from "@/lib/journal/entry";

export type EntrySummary = { id: string; body: string; is_moment: boolean };

// A day's entries as previews (Today and the day view), newest first, each
// opening the editor; ★ for moments (UX: on every preview).
export async function EntryPreviews({ entries, testIdPrefix }: { entries: EntrySummary[]; testIdPrefix: string }) {
  const t = await getTranslations("entry");
  return (
    <ul className="mt-3 space-y-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={`/app/entries/${entry.id}`}
            data-testid={`${testIdPrefix}-${entry.id}`}
            className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-4 text-text hover:bg-pill"
          >
            {entry.is_moment && <MomentStar label={t("momentBadge")} />}
            <span className="line-clamp-3 whitespace-pre-line">{preview(entry.body)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
