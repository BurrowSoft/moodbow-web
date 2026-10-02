// The password rule shared by every web form that sets one (the app uses
// the same: at least 8 characters, r1-screens-and-copy.md §M3).
export const PASSWORD_MIN_LENGTH = 8;

export type NewPasswordError = "short" | "mismatch";

// Characters, not UTF-16 units, so an emoji counts once.
export function validateNewPassword(password: string, confirm: string): NewPasswordError | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return "short";
  if (password !== confirm) return "mismatch";
  return null;
}
