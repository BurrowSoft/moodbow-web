import type { ConditionId } from "./conditions";

// Help & FAQ describes the web journal and the released app's features
// (Today, Timeline, Insights, export, delete account), so it goes live with
// them: a draft on Previews, a 404 (and noindex) on Production until then
// (reviewer #23; UX may pick another real-people condition).
export const HELP_GATE: ConditionId = "web-journal-live";
