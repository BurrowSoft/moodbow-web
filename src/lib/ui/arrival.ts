// Where focus should land after a keyboard shortcut (1.1 O): "c" goes to
// Today and lands on the check-in; "/" goes to the Timeline and opens its
// search. A one-time request in memory (never the URL or storage): the
// target takes it when it mounts, or at once if it's already on screen.
export type Arrival = "checkIn" | "search";

let pending: Arrival | null = null;
const listeners = new Set<() => void>();

export function requestArrival(kind: Arrival) {
  pending = kind;
  listeners.forEach((l) => l());
}

export function takeArrival(kind: Arrival): boolean {
  if (pending !== kind) return false;
  pending = null;
  return true;
}

// Runs `onArrive` for a request already waiting, and for any made while
// mounted. Returns the cleanup.
export function onArrival(kind: Arrival, onArrive: () => void): () => void {
  const check = () => {
    if (takeArrival(kind)) onArrive();
  };
  check();
  listeners.add(check);
  return () => {
    listeners.delete(check);
  };
}
