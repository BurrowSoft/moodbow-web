import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Letters to future me (1.2) on the Timeline: each locked one as "A letter from you · opens
// on {date}", never its text (the page reads id and dates only: the Reviewer's read).
export async function LockedLetters({ letters }: { letters: { id: string; opensLabel: string }[] }) {
  if (letters.length === 0) return null;
  const t = await getTranslations("letters");
  return (
    <ul data-testid="timeline-letters" className="mt-6 space-y-2">
      {letters.map((l) => (
        <li key={l.id}>
          <Link href="/app/me/letters" data-testid="timeline-letter" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
            {t("timelineLine", { date: l.opensLabel })}
          </Link>
        </li>
      ))}
    </ul>
  );
}
