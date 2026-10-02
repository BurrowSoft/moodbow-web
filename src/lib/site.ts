// The canonical origin. moodbow.com redirects (308) to www, so canonical
// URLs, Open Graph URLs and the sitemap all use www.
export const SITE_URL = "https://www.moodbow.com";

// Support mailbox (live since 2026-10-02, Vitor).
export const SUPPORT_EMAIL = "support@moodbow.com";

// The subject is copy, so it comes from messages (home.notifySubject).
export function notifyMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export const BURROWSOFT_URL = "https://www.burrowsoft.com";

// Days deleted data can survive in Supabase backups. null until Mobile Dev
// confirms the plan's real retention; the account-deletion page shows the
// backups line only when the "backup-retention-confirmed" condition is met
// AND this is a number (text = enforcement).
export const BACKUP_RETENTION_DAYS: number | null = null;
