// Today's mood as the check-in card last saved it in this page, for whatever follows it
// (the toolbox card, 1.2): the server's value until a save, then the saved one. Nothing is
// stored; a reload starts from the server again.
const listeners = new Set<() => void>();
let saved: { date: string; mood: number } | null = null;

export const subscribeTodayMood = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function publishTodayMood(date: string, mood: number) {
  saved = { date, mood };
  listeners.forEach((cb) => cb());
}

// The saved mood for that day, or the server's if nothing was saved here yet.
export const todayMoodFor = (date: string, fromServer: number | null) => (saved?.date === date ? saved.mood : fromServer);

// Tests only.
export function resetTodayMood() {
  saved = null;
}
