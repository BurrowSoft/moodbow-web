// How long the browser waits on a server action that someone is waiting on
// (UX, the timeout audit): past it, the call counts as failed and the
// screen's own failure path runs (offline copy, kept draft, Try again). A
// late answer is ignored. The server side gives up on its own as well
// (lib/supabase/deadline, each page's maxDuration).
export const SAVE_WAIT_MS = 30_000;
export const EXPORT_WAIT_MS = 45_000;
export const IMPORT_BATCH_WAIT_MS = 60_000;

// What a call that ran out of time rejects with (never a redirect digest, so
// callers treat it like a dropped connection).
export class TimedOut extends Error {
  constructor() {
    super("No answer in time");
    this.name = "TimedOut";
  }
}

export function withTimeout<T>(call: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimedOut()), ms);
    call.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
