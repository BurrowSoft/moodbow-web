// No release-health sessions (decision 49). Session envelopes copy the user
// id into "did" and never pass through beforeSend, so the scrubber can't
// clean them: the integrations that create them are removed instead.
// - Browser: the BrowserSession integration is dropped.
// - Node: the Http integration is rebuilt with sessions: false (it records a
//   session per incoming request by default).
// - Edge: the SDK records no sessions.
// Sentry.setUser and friends are also banned in src (eslint.config.mjs).

type Named = { name: string };

export function withoutBrowserSessions<T extends Named>(defaults: T[]): T[] {
  return defaults.filter((i) => i.name !== "BrowserSession");
}

export function withoutServerSessions<T extends Named>(defaults: T[], httpWithoutSessions: () => T): T[] {
  return defaults.map((i) => (i.name === "Http" ? httpWithoutSessions() : i));
}
