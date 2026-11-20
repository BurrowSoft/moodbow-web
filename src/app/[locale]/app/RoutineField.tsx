"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Routine in the check-in (1.4 F, board 29): under Tags, the person's items as chips, each a tick
// for the day (a toggle button: pressed or not). No items yet: one line and a way to set them up.
// The names are the person's own words: never counted, never logged.
export type CardRoutine = { items: { id: string; name: string }[]; ticks: string[] };

// The same ticks whatever their order.
export const sameTicks = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

function Tick() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function RoutineField({ items, ticks, onChange }: { items: CardRoutine["items"]; ticks: string[]; onChange: (ticks: string[]) => void }) {
  const t = useTranslations("routine");
  const tt = useTranslations("today");
  const id = useId();
  return (
    <div className="mt-6" data-testid="checkin-routine" role="group" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`} className="font-medium text-text">
        {t("rowTitle")} <span className="ml-2 font-normal text-muted">{tt("optional")}</span>
      </p>
      {items.length === 0 ? (
        <p data-testid="checkin-routine-empty" className="mt-2 text-sm text-text">
          {t("rowEmpty")}{" "}
          <Link href="/app/me/routine" data-testid="checkin-routine-setup" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
            {t("rowSetUp")}
          </Link>
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => {
            const on = ticks.includes(item.id);
            return (
              <li key={item.id} className="max-w-full">
                <button
                  type="button"
                  aria-pressed={on}
                  data-testid="checkin-routine-item"
                  onClick={() => onChange(on ? ticks.filter((x) => x !== item.id) : [...ticks, item.id])}
                  className={`inline-flex min-h-11 max-w-full items-center gap-[6px] rounded-full px-[14px] text-left ${on ? "bg-accent text-on-accent" : "border border-border text-text"}`}
                >
                  {on && <Tick />}
                  <span className="min-w-0 [overflow-wrap:anywhere]">{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// The saved card: the day's ticked items, in the items' order; none ticked, nothing.
export function RoutineSummary({ items, ticks }: { items: CardRoutine["items"]; ticks: string[] }) {
  const t = useTranslations("routine");
  const ticked = items.filter((i) => ticks.includes(i.id));
  if (ticked.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" data-testid="checkin-summary-routine" aria-label={t("rowTitle")}>
      {ticked.map((item) => (
        <li key={item.id} className="inline-flex max-w-full items-center gap-[6px] rounded-full border border-border px-[12px] py-1 text-sm text-text [overflow-wrap:anywhere]">
          <Tick />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

export function RoutineFailed() {
  const t = useTranslations("routine");
  return (
    <p role="alert" data-testid="checkin-routine-failed" className="mt-2 text-sm font-medium text-accent">
      {t("saveFailed")}
    </p>
  );
}
