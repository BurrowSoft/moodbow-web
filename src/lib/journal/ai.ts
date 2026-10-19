import { pageGate } from "@/lib/conditions";
import { hasCurrentConsent, type Me } from "./me";

// M9 "Reflect with Moodbow" on the web (specs/m9-ai-reflections.md,
// supabase/contracts/reflect.md). Settings values as in user_settings
// (moodbow-app migration 001).
export const TONES = ["warm", "direct", "brief"] as const;
export type Tone = (typeof TONES)[number];
export const FOCUS_AREAS = ["sleep", "stress", "work", "study", "relationships", "family", "health", "self_esteem"] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const isTone = (v: unknown): v is Tone => typeof v === "string" && (TONES as readonly string[]).includes(v);
export const isFocusArea = (v: unknown): v is FocusArea => typeof v === "string" && (FOCUS_AREAS as readonly string[]).includes(v);

// Anything AI is on the page at all: the global switch is on
// (get_me().ai_available) and this build shows AI ("ai-live": a draft on
// Previews, hidden on Production until it's met). Otherwise no Me → AI and
// no Reflect, like the app's AI_ENABLED build flag.
export function aiShown(me: Pick<Me, "ai_available">): boolean {
  return me.ai_available === true && pageGate("ai-live") !== "hidden";
}

// The Reflect button: AI shown, a current AI consent, and AI on in settings
// (reflect.md, Gate).
export function canReflect(me: Pick<Me, "ai_available" | "consents" | "settings">): boolean {
  return aiShown(me) && hasCurrentConsent(me, "ai") && me.settings?.ai_enabled === true;
}
