// A check-in just saved on Today, for what follows it on the page (1.3 §6: Today's Plus card hides
// after one of the two lowest faces). Nothing is stored: a reload starts from the server's rows.
export const CHECKIN_SAVED_EVENT = "moodbow:checkin-saved";
export type CheckInSavedDetail = { date: string; mood: number };

// The two lowest faces of the five (MOODS 1–5): never a Plus offer on such a day.
export const isLowMood = (mood: number | null | undefined): boolean => typeof mood === "number" && mood <= 2;
