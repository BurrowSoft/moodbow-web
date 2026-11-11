"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { addTag, TAG_RULES, type TagProblem } from "@/lib/journal/tags";

// Tags on a check-in (UX, 11 Nov): the person's own words, up to 5 a day.
// Typed (Enter or a comma adds it) or picked from their recent tags; each chip
// has its own remove button. The rules are said before anything is sent.
export function TagsField({ tags, recent, onChange }: { tags: string[]; recent: string[]; onChange: (tags: string[]) => void }) {
  const t = useTranslations("today");
  const id = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<TagProblem | null>(null);
  const add = (raw: string) => {
    const next = addTag(tags, raw);
    // A repeat or an empty entry is simply not added.
    setProblem(next.problem === "too_many" || next.problem === "too_long" ? next.problem : null);
    if (!next.problem) onChange(next.tags);
    if (!next.problem || next.problem === "duplicate" || next.problem === "empty") setText("");
  };
  const lower = new Set(tags.map((x) => x.toLocaleLowerCase()));
  const picks = recent.filter((r) => !lower.has(r.toLocaleLowerCase())).slice(0, 12);

  return (
    <div className="mt-6" data-testid="checkin-tags">
      <label htmlFor={`${id}-input`} className="block font-medium text-text">
        {t("tagsLabel")}
      </label>
      {tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" data-testid="checkin-tags-list">
          {tags.map((tag) => (
            <li key={tag} className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-pill pl-3 text-text">
              <span className="min-w-0 [overflow-wrap:anywhere]">{tag}</span>
              <button
                type="button"
                aria-label={t("tagsRemove", { tag })}
                data-testid="checkin-tag-remove"
                onClick={() => {
                  setProblem(null);
                  onChange(tags.filter((x) => x !== tag));
                }}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={`${id}-input`}
        value={text}
        placeholder={t("tagsPlaceholder")}
        enterKeyHint="done"
        maxLength={64}
        aria-describedby={problem ? `${id}-problem` : undefined}
        data-testid="checkin-tags-input"
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Enter adds the tag; it never sends the check-in.
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => text.trim() && add(text)}
        className="mt-2 min-h-11 w-full min-w-0 rounded-2xl border border-border bg-surface px-[12px] text-text placeholder:text-muted"
      />
      {problem && (
        <p id={`${id}-problem`} role="status" data-testid="checkin-tags-problem" className="mt-1 text-sm text-text">
          {problem === "too_many" ? t("tagsTooMany") : t("tagsTooLong")}
        </p>
      )}
      {picks.length > 0 && tags.length < TAG_RULES.perDay && (
        <div className="mt-3">
          <p className="text-sm text-muted">{t("tagsRecent")}</p>
          <ul className="mt-1 flex flex-wrap gap-2" data-testid="checkin-tags-recent">
            {picks.map((r) => (
              <li key={r}>
                <button type="button" onClick={() => add(r)} className="inline-flex min-h-11 max-w-full items-center rounded-full border border-border px-3 text-text [overflow-wrap:anywhere]">
                  {r}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
