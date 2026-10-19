import { getTranslations } from "next-intl/server";
import { MomentStar } from "@/components/MomentStar";
import { Link } from "@/i18n/navigation";
import { preview } from "@/lib/journal/entry";
import { withOrigin, type Origin } from "@/lib/journal/origin";

export type EntrySummary = { id: string; body: string; is_moment: boolean; created_at: string };

// A day's entries as previews (Today and the day view), newest first, each
// opening the entry: the time it was written (the profile's time zone, the
// region's format), ★ for moments, and two lines of the text (decision
// 161: entries have no titles).
// from: the page they're on (decision 152), so the entry's nav and Back
// lead back here.
type Props = { entries: EntrySummary[]; testIdPrefix: string; from: Origin; timeZone: string; dateLocaleTag: string };
export async function EntryPreviews({ entries, testIdPrefix, from, timeZone, dateLocaleTag }: Props) {
  const t = await getTranslations("entry");
  const time = new Intl.DateTimeFormat(dateLocaleTag, { hour: "numeric", minute: "2-digit", timeZone });
  return (
    <ul className="mt-3 space-y-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={withOrigin(`/app/entries/${entry.id}`, from)}
            data-testid={`${testIdPrefix}-${entry.id}`}
            className="block rounded-2xl border border-border bg-surface p-4 text-text hover:bg-pill"
          >
            <span className="flex items-center justify-between gap-2 text-xs text-muted">
              <time dateTime={entry.created_at}>{time.format(new Date(entry.created_at))}</time>
              {entry.is_moment && <MomentStar label={t("momentBadge")} />}
            </span>
            <span className="mt-1 line-clamp-2 whitespace-pre-line">{preview(entry.body)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
