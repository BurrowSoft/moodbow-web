import { conditionMet } from "./conditions";

// Features the public pages may claim or link to. Each flips to true in its
// own small reviewed PR when the feature is live for users, not when the
// code is merged.
export const liveFeatures = {
  // The signed-in web journal: /app, /sign-in, /forgot-password and the
  // "Continue on the web" button on /email-confirmed. One source of truth:
  // the web-journal-live condition (it also gates the routes).
  webJournal: conditionMet("web-journal-live"),
} as const;
