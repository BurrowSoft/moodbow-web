// A light shape check for the email fields (the real check is Supabase
// sending the confirmation). Trimmed and lowercased before use.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_SHAPE.test(email);
}
