// Features the public pages may claim or link to. Each flips to true in its
// own small reviewed PR when the feature is live for users, not when the
// code is merged.
export const liveFeatures = {
  // The signed-in web journal (W0): the "Continue on the web" button on
  // /email-confirmed.
  webJournal: false,
} as const;
