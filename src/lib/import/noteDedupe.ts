// Notes already in the account (1.1 P, UX §P "M1"): importing a file
// imports, per day and exact text, only the copies the account doesn't
// have yet: max(0, copies in the file − copies already there that day). So
// re-importing your own export into the same account adds nothing, while a
// fresh account still gets every copy. Counted once, before anything is
// written (a batch must never see an earlier batch's notes), and the FIRST
// copies are the ones dropped, so the ones that remain keep their ids
// (dup ≥ k) and a resumed run still matches by id (reviewer #103).
import type { ImportEntry } from "./journalImport";

// Text equality is exact after line-ending normalization: no trim, no case
// folding (the same rule as the import's own notes).
export const normalizeNote = (body: string) => body.replace(/\r\n?/g, "\n");

// The key both sides count by: a hash of the day and the exact text, so the
// account's counts come back without any note text. WebCrypto in both the
// browser and the server action (Node's global crypto).
export async function noteKey(date: string, body: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${date}\n${normalizeNote(body)}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The plan's notes minus the copies the account already has: per (day,
// text), the first k in the file's order are dropped. Returns both, so the
// summary can count the dropped ones as already in Moodbow.
export async function dropExistingNotes(entries: ImportEntry[], existing: Map<string, number>): Promise<{ keep: ImportEntry[]; dropped: ImportEntry[] }> {
  const seen = new Map<string, number>();
  const keep: ImportEntry[] = [];
  const dropped: ImportEntry[] = [];
  for (const e of entries) {
    const key = await noteKey(e.date, e.body);
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    (index < (existing.get(key) ?? 0) ? dropped : keep).push(e);
  }
  return { keep, dropped };
}
