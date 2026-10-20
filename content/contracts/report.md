# `report`: "Your week" (1.1 D, decision 173)

The weekly report. It is one server path for the app and the web: the Supabase edge function `report`, called with the **user's JWT**, exactly like `reflect` (see reflect.md for callers, CORS, `client_key` rules and the metering steps).
- Product and prompt rules: `specs/m9-weekly-report.md`.
- DB side: migration 009 (it reuses `ai_reports` from 003).

## Request
`POST /functions/v1/report`
```json
{ "client_key": "<uuid>" }
```
- **The client doesn't name the week.** The server takes the user's **last complete week** (Monday–Sunday in `profiles.time_zone`), and the DB checks it again (`_last_week_start`).
- `client_key` is a new uuid per tap, re-sent unchanged on any retry of that tap. Disable the button while a tap is in flight.

## 200
```json
{
  "report": {
    "id": "<uuid>",
    "week_start": "2026-10-12",
    "body": { "sections": { "changed": "…", "went_well": "…", "notice": "…", "idea": "…" } },
    "tier": "full",
    "created_at": "…"
  },
  "credits": { "balance": 690, "tier_now": "full" }
}
```
- **`body`** is one of two shapes:
  - `{"sections": {"changed", "went_well", "notice", "idea"?}}`. Each is a plain string, and `idea` may be missing (then show no "One small idea").
  - `{"crisis": "<text>"}` (decision 157). Show only the text in the voice card and the getHelpLabel button under it (decision 124), with no headings.
- **Headings:** reportChanged "What changed", reportWentWell "What went well", reportNotice "Worth noticing", reportIdea "One small idea".
- **Asking again for the same week** returns the **stored** report as a 200. Nothing runs and nothing is debited (the same tap's `client_key` also replays).
- **Delete** the report (an RLS `delete` on `ai_reports` by `id`) to allow a new one.

## Errors: `{ "error": "<code>" }`
These are as for reflect, with two differences:
- `reflect_failed` becomes **`report_failed`** (502). Client: the reflectError wording ("Moodbow couldn't … right now").
- New: **422 `not_enough`**: fewer than 3 check-ins that week. Client: **reportNotEnough**. Nothing is metered.

The others: 400 `invalid_value` (bad body, or a week boundary passed mid-request, so ask again), 401, 403 `ai_disabled` / `ai_consent_required`, 409 `in_progress` (retry the same key after ~2 s), 429 `rate_limited` / `daily_limit`, 503 `ai_budget_exhausted`.

## Reads
- The stored report for a week: `select id, period_start, body, tier, created_at from ai_reports where kind = 'weekly' and period_start = <Monday>` (RLS: own rows; at most one per week).
- The export already includes `ai_reports` (004). Delete account removes them (cascade).

## What the model sees (decision 176)
- **The week:** check-ins (numbers only) and the previous week's. Entries are passed with their date and ★.
- **Per entry:** max 2,000 characters. A longer one keeps its first 1,600 and last 400, joined by "[…]".
- **Per week:** max 16,000 characters of entry text.
- **Entries are picked in this order** until the budget is full:
  1. every entry the crisis matcher flags (contracts/crisis-keywords.json, the same rules and fixture as the clients), most recent first. The budget still holds; if flagged entries alone exceed it, the most recent are kept. A flagged entry's clip always contains what flagged it: if the first 1,600 + last 400 lose the phrase, the first 2,000-character window that has it is used, with "[…]" on each cut side;
  2. ★ moments;
  3. each day's longest entry, so every day is there;
  4. the rest, newest first.
- **Left-out entries** are counted, and the prompt says "{n} more entries not shown."
- **The server-side match** chooses what stays in the prompt and nothing else. It isn't stored, logged, counted or returned; the clients' safety card still runs on the device (decision 125).

## Server steps (for review)
1. Verify the JWT and validate the body. Read `profiles.time_zone, locale`, then compute the week.
2. A stored report for that week: return it (no metering).
3. Read the week's and the previous week's check-ins and the week's entries (as the user). Fewer than 3 check-ins that week: `not_enough`.
4. `ai_begin_request(uid, 'weekly_report', client_key, NULL, week)`. The DB refuses another week (`invalid_value`), an existing report (`report_exists`, so return the stored one) and a second in-flight request for the same week (`in_progress`).
5. Call the model: four tagged parts or `<crisis>`. Anything else fails as `format`.
6. Run the language guard + one full-model retry, with the first call passed as `p_discarded`. Then `ai_complete_report` (debits the delivered call only, decision 155) or `ai_finish_request(..., 'failed', <code>)`, always closed in a `finally`.
7. Never log, store in ai_requests or send to Sentry any entry, prompt or report text.
