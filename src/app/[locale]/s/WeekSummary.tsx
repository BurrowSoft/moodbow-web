import { MOOD_HEX } from "@/lib/share/moodbow";

// One shared week as the viewer sees it (1.4 G): the creator's preview in Me → Share renders this
// same component from share_preview's answer, so what they see before creating a link is exactly
// what the viewer sees (UX's condition; the plan's §7). Mood colours, the count and the chosen
// Routine percents only; never text.
export type WeekStrings = {
  weekOf: string; // with {date}
  checkIns: string[]; // index 0..7, already in the right plural
  routinePercent: string; // with {name} and {percent}
  routineNotEnough: string; // with {name}
  none: string;
  dayNone: string; // with {day}
  moods: string[]; // mood 1..5 labels, index 0..4
};
export type SummaryWeek = { week_start: string; days: { date: string; mood: number | null }[]; check_ins: number; routine?: { name: string; percent: number | null }[] };

export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

export function WeekSummary({ week, strings, locale, headingId, prefix = "shared" }: { week: SummaryWeek; strings: WeekStrings; locale: string; headingId: string; prefix?: string }) {
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const dayLong = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  return (
    <div className="space-y-4">
      <h2 id={headingId} className="text-base font-semibold text-text">
        {fill(strings.weekOf, { date: dateFormat.format(at(week.week_start)) })}
      </h2>
      <ol className="grid grid-cols-7 gap-[6px]" data-testid={`${prefix}-days`}>
        {week.days.map((d) => (
          <li key={d.date} className="flex flex-col items-center gap-[4px]">
            <span aria-hidden="true" className="text-xs text-muted">
              {dayFormat.format(at(d.date))}
            </span>
            <span aria-hidden="true" className={`block h-[32px] w-full rounded-lg ${d.mood === null ? "border border-dashed border-border" : ""}`} style={d.mood === null ? undefined : { backgroundColor: MOOD_HEX[d.mood - 1] }} />
            <span className="sr-only">{d.mood === null ? fill(strings.dayNone, { day: dayLong.format(at(d.date)) }) : `${dayLong.format(at(d.date))}: ${strings.moods[d.mood - 1]}`}</span>
          </li>
        ))}
      </ol>
      <p data-testid={`${prefix}-count`} className="text-text">
        {week.check_ins === 0 ? strings.none : strings.checkIns[Math.min(week.check_ins, 7)]}
      </p>
      {week.routine && week.routine.length > 0 && (
        <ul className="space-y-1 text-text [overflow-wrap:anywhere]" data-testid={`${prefix}-routine`}>
          {week.routine.map((r, i) => (
            <li key={i}>{r.percent === null ? fill(strings.routineNotEnough, { name: r.name }) : fill(strings.routinePercent, { name: r.name, percent: String(r.percent) })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
