import type { CrisisKeywords } from "./crisis";

// The crisis keyword list the after-save check uses. The shared contract
// (supabase/contracts/crisis-keywords.json, app PR #23) isn't synced yet,
// so there are none and the after-save card never opens; Me → Get help now
// and the reflection's button work regardless. Once it's synced
// (npm run sync:contracts), this becomes an import of
// content/contracts/crisis-keywords.json.
export const CRISIS_KEYWORDS: CrisisKeywords | null = null;
