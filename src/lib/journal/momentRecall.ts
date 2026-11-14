// Memories: the person chooses when a moment comes back (Vitor, 14 Nov; spec "Memories"): each
// moment's "Bring this back" choices, a subset of 1, 6 and 12 months, all three by default (so
// nothing changes until someone changes it). Stored on the entry (entries.recall_months, moodbow-app
// migration 034), set through entry_set_recall, shared with the app (on-this-day.json).
export const RECALL_MONTHS = [1, 6, 12] as const;
export type RecallMonth = (typeof RECALL_MONTHS)[number];

// What's stored, read safely: a sorted subset of {1, 6, 12}; missing or unreadable means all three.
export function parseRecall(v: unknown): RecallMonth[] {
  if (!Array.isArray(v)) return [...RECALL_MONTHS];
  return RECALL_MONTHS.filter((m) => v.includes(m));
}

export const toggleRecall = (set: readonly RecallMonth[], m: RecallMonth): RecallMonth[] =>
  set.includes(m) ? set.filter((x) => x !== m) : RECALL_MONTHS.filter((x) => x === m || set.includes(x));
