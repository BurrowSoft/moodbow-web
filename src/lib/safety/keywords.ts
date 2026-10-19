import contract from "../../../content/contracts/crisis-keywords.json";
import type { CrisisKeywords } from "./crisis";

// The crisis keyword list the after-save check uses: the shared contract
// (supabase/contracts/crisis-keywords.json in the app repo, decision 125),
// synced byte for byte by npm run sync:contracts. Only `languages` is used;
// the contract's fixture runs in crisis.test.ts.
export const CRISIS_KEYWORDS: CrisisKeywords | null = contract as CrisisKeywords;
