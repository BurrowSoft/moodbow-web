// What the user types to confirm deleting their account (M7): "DELETE",
// the same word in every language (it's what they type).
export const DELETE_WORD = "DELETE";

// The export file's name: moodbow-export-2026-10-02.json (the day the
// server made it; just "moodbow-export.json" if that's missing).
export const exportFileName = (date: string) => (date ? `moodbow-export-${date}.json` : "moodbow-export.json");

// The readable copy's name: moodbow-journal-2026-10-02.txt (UX).
export const journalFileName = (date: string) => (date ? `moodbow-journal-${date}.txt` : "moodbow-journal.txt");
