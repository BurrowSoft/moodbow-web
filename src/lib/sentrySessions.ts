// No release-health sessions (decision 49). Session envelopes copy the user
// id into "did" and never pass through beforeSend, so the scrubber can't
// clean them: the integrations that create them are removed instead.
// - Every runtime: any integration whose name contains "Session" is dropped
//   (browser: BrowserSession; Node: ProcessSession, which starts a session
//   per process and reports it as crashed on an uncaught error).
// - Node: the Http integration is also rebuilt with sessions: false (it
//   records a session aggregate per incoming request by default).
// Sentry.setUser and friends are also banned in src (eslint.config.mjs).

type Named = { name: string };

const SESSION_INTEGRATION = /Session/;

export function withoutSessions<T extends Named>(defaults: T[]): T[] {
  return defaults.filter((i) => !SESSION_INTEGRATION.test(i.name));
}

export function withoutServerSessions<T extends Named>(defaults: T[], httpWithoutSessions: () => T): T[] {
  return withoutSessions(defaults).map((i) => (i.name === "Http" ? httpWithoutSessions() : i));
}
