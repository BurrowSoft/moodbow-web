// The readable export (moodbow-journal.txt), rendered in the browser from
// export_my_data()'s JSON. The layout is the shared contract
// content/contracts/export-text.md (from moodbow-app): the app renders the
// same bytes, and both test that export_fixture.json gives
// export_fixture.txt exactly.

// A translator for the user's language: t("namespace.key", { … }).
export type Translate = (key: string, values?: Record<string, string>) => string;

type CheckInRow = { local_date: string; mood: number; sleep_hours: number | string | null; sleep_quality: "poor" | "okay" | "good" | null; exercise_minutes: number | null; stress: number | null };
type EntryRow = { id: string; entry_date: string; body: string; is_moment: boolean };
type ReflectionRow = { entry_id: string | null; body: string; created_at: string };
type MemoryRow = { fact: string };

export type ExportDoc = {
  format: string;
  format_version: number;
  exported_at: string;
  // No email for an account started without one (decision 216).
  account?: { email?: string | null } | null;
  check_ins?: CheckInRow[];
  entries?: EntryRow[];
  ai_reflections?: ReflectionRow[];
  ai_memories?: MemoryRow[];
};

// Only format 1 of moodbow-export: anything else is refused (no partial
// text; the JSON is still offered).
export const canRenderText = (doc: unknown): doc is ExportDoc =>
  !!doc && typeof doc === "object" && (doc as ExportDoc).format === "moodbow-export" && (doc as ExportDoc).format_version === 1;

// ASCII digits, "." decimals, no trailing ".0", in every language.
const num = (v: number | string) => String(Number(v));

// exported_at in UTC, "YYYY-MM-DD HH:MM UTC", seconds truncated.
export function exportedWhen(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// Bodies: \r\n and \r → \n, then trailing blank lines (empty, or only
// spaces/tabs) removed. Leading blank lines and line-end spaces stay.
export function cleanBody(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && /^[ \t]*$/.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
}

const QUALITY = { poor: "today.sleepPoor", okay: "today.sleepOkay", good: "today.sleepGood" } as const;

export function renderExportText(doc: ExportDoc, t: Translate): string {
  const field = (label: string, value: string) => t("export.exportField", { label, value });
  const blocks: string[] = [];
  // The contract (decision 216): an account with no email (null, missing or
  // blank after trimming) is "not backed up yet", never "Account: " alone.
  const email = doc.account?.email;
  const accountLine = email && email.trim() ? t("export.exportAccount", { email }) : t("export.exportAccountNotBackedUp");

  blocks.push(
    [
      t("export.exportTitle"),
      t("export.exportExported", { when: exportedWhen(doc.exported_at) }),
      accountLine,
      t("export.exportPrivateNote"),
    ].join("\n"),
  );

  const checkIns = doc.check_ins ?? [];
  if (checkIns.length > 0) {
    const lines = checkIns.map((c) => {
      const parts = [c.local_date, field(t("export.exportMood"), t("export.exportMoodValue", { label: t(`today.mood${c.mood}`), value: num(c.mood) }))];
      if (c.sleep_hours !== null && c.sleep_hours !== undefined) {
        const hours = t("today.sleepHours", { hours: num(c.sleep_hours) });
        parts.push(field(t("export.exportSleep"), c.sleep_quality ? t("export.exportSleepValue", { hours, quality: t(QUALITY[c.sleep_quality]) }) : hours));
      } else if (c.sleep_quality) {
        parts.push(field(t("export.exportSleep"), t(QUALITY[c.sleep_quality])));
      }
      if (c.exercise_minutes !== null && c.exercise_minutes !== undefined) {
        const m = Number(c.exercise_minutes);
        parts.push(field(t("export.exportExercise"), m === 0 ? t("today.exerciseNone") : m === 90 ? t("today.exercise90") : t("today.exerciseMinutes", { minutes: num(m) })));
      }
      if (c.stress !== null && c.stress !== undefined) parts.push(field(t("export.exportStress"), t("export.exportOfFive", { value: num(c.stress) })));
      return parts.join(" · ");
    });
    blocks.push([t("export.exportCheckins"), ...lines].join("\n"));
  }

  const entries = doc.entries ?? [];
  if (entries.length > 0) {
    const items = entries.map((e) => `${e.entry_date}${e.is_moment ? ` · ★ ${t("entry.momentBadge")}` : ""}\n${cleanBody(e.body)}`);
    blocks.push(`${t("export.exportEntries")}\n${items.join("\n\n")}`);
  }

  const reflections = doc.ai_reflections ?? [];
  if (reflections.length > 0) {
    const dateOf = new Map(entries.map((e) => [e.id, e.entry_date]));
    const items = reflections.map((r) => {
      const date = (r.entry_id && dateOf.get(r.entry_id)) || new Date(r.created_at).toISOString().slice(0, 10);
      return `${t("export.exportReflectionOn", { date })}\n${cleanBody(r.body)}`;
    });
    blocks.push(`${t("export.exportReflections")}\n${items.join("\n\n")}`);
  }

  const memories = doc.ai_memories ?? [];
  if (memories.length > 0) blocks.push([t("export.exportMemories"), ...memories.map((m) => `- ${m.fact}`)].join("\n"));

  return `${blocks.join("\n\n")}\n`;
}
