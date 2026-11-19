// Setup after first use (1.3 §6): Today's "Make it yours" card, gone for good on this device once
// it's closed or Setup is opened. Device-only; no storage means it comes back, which is harmless.
export const SETUP_LATER_KEY = "moodbow.setupLaterDone";

export function readSetupLaterDone(): boolean {
  try {
    return window.localStorage.getItem(SETUP_LATER_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSetupLaterDone(): void {
  try {
    window.localStorage.setItem(SETUP_LATER_KEY, "1");
  } catch {
    // no storage: it comes back next visit
  }
}

// The first time the journal opens, onboarding completes with protective defaults (the Reviewer's
// rulings): the reminder off until they choose one; tone and focus stay at their defaults (not sent);
// AI only as its own consent says (complete_onboarding doesn't touch it).
export const PROTECTIVE_ONBOARDING = { p_reminder_on: false, p_reminder_time: "21:00" } as const;
