// The canonical origin. moodbow.com redirects (308) to www, so canonical
// URLs, Open Graph URLs and the sitemap all use www.
export const SITE_URL = "https://www.moodbow.com";

// Until a moodbow.com mailbox exists (Vitor), support goes to BurrowSoft's.
export const SUPPORT_EMAIL = "support@burrowsoft.com";

export const NOTIFY_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Notify me about Moodbow")}`;

export const BURROWSOFT_URL = "https://www.burrowsoft.com";

// Days deleted data can survive in Supabase backups. null until Mobile Dev
// confirms the plan's real retention; the account-deletion page shows the
// backups line only when the "backup-retention-confirmed" condition is met
// AND this is a number (text = enforcement).
export const BACKUP_RETENTION_DAYS: number | null = null;
