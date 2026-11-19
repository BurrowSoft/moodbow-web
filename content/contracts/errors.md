# Server error codes (app + web contract)

Every RPC raises `RAISE EXCEPTION '<code>'`; clients get the code as the error message (`PostgrestException.message` in Dart, `error.message` in supabase-js). **Both clients map every code below to a string in every shipped language before the server starts raising it** (team-process.md §4). Unknown codes fall back to the generic "Something went wrong" string. Codes never change meaning; a new situation gets a new code.

## Client-facing (authenticated / anon RPCs)

| Code | Raised by | Meaning | Suggested UI |
|---|---|---|---|
| `not_authenticated` | every signed-in RPC | No session | Send to Sign in |
| `consent_required` | `upsert_check_in`, `save_entry`, `complete_onboarding` | Privacy, terms, 18+ or health-data consent missing | Route to Consent |
| `date_in_future` | `upsert_check_in`, `save_entry` | Date after the user's local today (profile time zone) | "You can't log a day that hasn't happened yet" |
| `invalid_value` | `upsert_check_in`, `save_entry`, `update_settings`, `ai_begin_request`, `credit_purchase`, `ai_finish_request` | Out-of-range or malformed argument (a client bug) | Generic error |
| `entry_empty` | `save_entry` | Body blank after trimming | Disable Save |
| `entry_too_long` | `save_entry` | Body over 20,000 characters | `entryTooLong` |
| `stale_write` | `upsert_check_in`, `save_entry` | `p_expected_updated_at` no longer matches (edited on another device), or a new client id raced | Reload the item, keep the user's text, ask to retry |
| `check_in_exists` | `upsert_check_in(p_insert_only => true)` (012) | The day already has a check-in (saved elsewhere while this card didn't know the server state) | Show both versions: Keep mine / Use the other one (decision 209, r1 "Check-in conflict") |
| `not_found` | `delete_check_in`, `save_entry`, `delete_entry`, `update_profile`, `update_settings`, `ai_finish_request` | Missing, or another user's row (indistinguishable on purpose) | Refresh the list |
| `invalid_locale` | `update_profile` | Not in `supported_locales` (en, fr, es, pt, de, it, th since 015) | Generic error |
| `invalid_time_zone` | `update_profile` | Not an IANA zone Postgres knows | Generic error |
| `invalid_country` | `update_profile` | Not ISO 3166-1 alpha-2 (`''` clears) | Generic error |
| `ai_consent_required` | `update_settings(p_ai_enabled => true)`, `ai_begin_request` | No current AI consent, or AI switched off | Offer the AI consent |
| `invalid_consent` | `record_consents` | Not a non-empty array of `{kind, version, granted}` | Generic error |
| `unknown_version` | `record_consents` | `(kind, version)` not in `policy_versions` | Update the app |
| `plus_required` | `letter_save` (032), `picture_reserve` (035) | No Moodbow Plus (no lapse grace for pictures) | Open the Plus screen |
| `not_a_moment` | `picture_reserve` (035) | Pictures are added only to a starred moment | Generic error (the camera only shows on moments) |
| `picture_limit` | `picture_reserve` (035) | The entry already has 3 pictures (starred or not, pending ones included) | Hide add; generic error if raced |
| `picture_quota` | `picture_reserve`, `picture_confirm` (035) | This UTC month's picture bytes would pass the allowance (no refund on delete) | "You've added this month's pictures. More next month." |
| `not_uploaded` | `picture_confirm` (035) | One of the two files isn't in the bucket | Retry the upload, else generic error |

## `bo`
The function's own codes are in `bo.md`.

## Server-only (edge functions / webhooks, service_role)

| Code / status | Raised by | Meaning |
|---|---|---|
| `ai_disabled` | `ai_begin_request` | Global AI switch off (`app_config.ai_enabled_global`) |
| `ai_budget_exhausted` | `ai_begin_request` | Org monthly real-cost budget reached |
| `daily_limit` | `ai_begin_request` | No credits and today's Lite cap (`lite_daily_cap_usd`) reached; the client shows "come back tomorrow" |
| `already_finished` | `ai_finish_request` | The request row was already closed |
| `unknown_model` | `ai_finish_request` | No price in `app_config.model_prices` for the model |
| `credit_purchase` → `{status}` | `credited` / `duplicate` / `no_user` | Never raises for retries or deleted users (webhook gets a 200) |
| `credit_refund(p_external_ref)` → `{status}` | `refunded` / `duplicate` / `not_found` | Refunds the purchase's own credits (decision 29); idempotent on `'refund:' \|\| external_ref` |
| `config_invalid` | `ai_finish_request`; the starter grant (logged, signup unaffected) | `markup` or `credits_per_usd` missing or ≤ 0: fails closed, never a free full model |

The edge function turns `ai_disabled`, `ai_budget_exhausted`, `daily_limit` and `ai_consent_required` into its own JSON error body `{ "code": "<code>" }` for the clients (`FunctionException.details` in Dart).
