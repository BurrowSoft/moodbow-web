import type { ConditionId } from "./conditions";

// Help & FAQ is public from the 0.9 closed test on: the app's Me → Help & FAQ
// opens it (decision 212). Each article says only what's live (its pending
// blocks: the web journal's lines wait for web-journal-live, the app's for
// the app-* conditions), and an article with nothing left is a 404.
export const HELP_GATE: ConditionId = "help-public";
