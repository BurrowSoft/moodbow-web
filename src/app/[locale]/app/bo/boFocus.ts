// Focus across the way into Bo and back (UX, from the Web Tester's A4): the button opens
// Bo's screen with focus on its heading, and coming back puts it on the button, not the
// page's body. One-shot marks kept here, above the routes; a mark whose page never comes
// expires, and focus someone has already moved is never taken back.
const EXPIRES_MS = 10_000;
let openedByButton = 0;
let leftBo = 0;

const fresh = (at: number) => at > 0 && Date.now() - at < EXPIRES_MS;

// Nobody has moved focus since the old page went (Announcer's rule).
export function focusUnclaimed(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || active === document.documentElement || !active.isConnected;
}

export function markOpenedByButton() {
  openedByButton = Date.now();
}

export function takeOpenedByButton(): boolean {
  const was = fresh(openedByButton);
  openedByButton = 0;
  return was;
}

export function markLeftBo() {
  leftBo = Date.now();
}

export function takeLeftBo(): boolean {
  const was = fresh(leftBo);
  leftBo = 0;
  return was;
}
