"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GetHelpNow } from "@/components/SafetyCard";
import { groupOpen, LIBRARY, libraryPrompt, libraryText, readPlace, savePlace, type LibraryGroup } from "@/lib/journal/promptLibrary";

const GROUP_LABELS = { noticing: "libraryNoticing", gratitude: "libraryGratitude", "hard-days": "libraryHardDays", relationships: "libraryRelationships", ahead: "libraryAhead" } as const;
const CAPPED = "max-sm:[font-size:min(1rem,max(10vw,32px))]";
const LINK = "min-h-11 font-medium text-accent underline underline-offset-4";

// "Need a prompt?" beside the day's prompt, above an empty entry (the editor shows this only
// where the day's prompt shows: never on a crisis-flagged day). Its groups in list order; Hard
// days is free and has Get help now under its line. Plus never appears while writing (UX, 12
// Nov): no lock or sheet here, so without Plus (or with Plus unreadable) only the free group is
// listed, and with Plus all five. The rest are found on the Plus screen and in Help. "Use this"
// puts the prompt above the box, as the day's prompt is; nothing is written into the entry.
export function PromptLibrary({ uid, country, hasPlus, onUse }: { uid: string; country: string | null | undefined; hasPlus: boolean; onUse: (text: string) => void }) {
  const t = useTranslations("entry");
  const language = useLocale();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<LibraryGroup | null>(null);
  const [place, setPlace] = useState(0);
  const groups = LIBRARY.filter((g) => groupOpen(g, hasPlus));
  // Each step unmounts the button that was pressed, so focus is put where the reader goes next
  // (the Web Tester's keyboard walk, UX 12 Nov): opening → the first group; a group → its
  // prompt; Back → the group they came from; Use this → the entry box; Escape → "Need a prompt?".
  // An element id, focused after the render that shows it.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const openLibrary = () => {
    focusNext.current = groups[0] ? `entry-library-group-${groups[0].id}` : null;
    setOpen(true);
  };
  const choose = (g: LibraryGroup) => {
    focusNext.current = "entry-library-prompt";
    setGroup(g);
    setPlace(readPlace(uid, g.id));
  };
  const back = () => {
    if (group) focusNext.current = `entry-library-group-${group.id}`;
    setGroup(null);
  };
  // Not a dialog, but Escape closes it, as people expect.
  const escape = (e: KeyboardEvent) => {
    // Only from inside the library's own DOM: Get help now's card or dialog (a portal, whose
    // events still bubble here through React) closes itself, not the library.
    if (e.key !== "Escape" || e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    focusNext.current = "entry-library-open";
    setGroup(null);
    setOpen(false);
  };
  const another = () => {
    if (!group) return;
    const next = place + 1;
    setPlace(next);
    savePlace(uid, group.id, next % group.prompts.length);
  };
  const use = () => {
    if (!group) return;
    onUse(libraryText(libraryPrompt(group, place), language));
    // The next one is where they'll start next time.
    savePlace(uid, group.id, (place + 1) % group.prompts.length);
    // Where they'll write.
    focusNext.current = "entry-text";
    setGroup(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" id="entry-library-open" data-testid="entry-library-open" onClick={openLibrary} className={`${LINK} ${CAPPED}`}>
        {t("libraryOpen")}
      </button>
    );
  }

  if (group) {
    const prompt = libraryPrompt(group, place);
    return (
      <section aria-labelledby="entry-library-group" data-testid="entry-library" data-group={group.id} onKeyDown={escape} className={`w-full space-y-2 rounded-2xl border border-border bg-surface p-[12px] ${CAPPED}`}>
        <h2 id="entry-library-group" className="font-medium text-text">
          {t(GROUP_LABELS[group.id])}
        </h2>
        {group.help && (
          <>
            <p data-testid="entry-library-intro" className="text-muted">
              {t("libraryHardDaysIntro")}
            </p>
            <GetHelpNow country={country} testId="entry-library-help" neutral />
          </>
        )}
        {/* The site's ring skips tabindex="-1" targets (#51), but here the prompt is where a keyboard
            user lands after choosing a group, so it shows the same ring (UX, 12 Nov): keyboard only. */}
        <p id="entry-library-prompt" tabIndex={-1} data-testid="entry-library-prompt" data-prompt-id={prompt.id} className="text-text outline-none focus-visible:[outline:2px_solid_var(--accent)] focus-visible:[outline-offset:3px] [overflow-wrap:anywhere]">
          {libraryText(prompt, language)}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" data-testid="entry-library-use" onClick={use} className={LINK}>
            {t("libraryUse")}
          </button>
          <button type="button" data-testid="entry-library-another" onClick={another} className={LINK}>
            {t("libraryAnother")}
          </button>
          <button type="button" data-testid="entry-library-back" onClick={back} className={LINK}>
            {t("libraryBack")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t("libraryOpen")} data-testid="entry-library" onKeyDown={escape} className={`w-full rounded-2xl border border-border bg-surface p-[12px] ${CAPPED}`}>
      <ul className="space-y-1">
        {groups.map((g) => (
          <li key={g.id}>
            <button type="button" id={`entry-library-group-${g.id}`} data-testid={`entry-library-group-${g.id}`} onClick={() => choose(g)} className={LINK}>
              {t(GROUP_LABELS[g.id])}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
