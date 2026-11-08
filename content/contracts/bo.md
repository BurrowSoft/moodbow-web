# `bo`: Bo, Moodbow's AI

One server path for app and web: the Supabase edge function `bo`, called with the **user's JWT**. The web calls it server-side only. Spec: `specs/moodpal-1.0.md`, `specs/bo-risk-read.md`. Design: `specs/bo-design.md`. Tables and RPCs: migration 016.

## Requests
`POST /functions/v1/bo`

**Status,** at app open and on opening Bo, so people where Bo is off never see the button. Offline: the last known status; none known means hidden. No model call and no request row.
```json
{ "action": "status", "region_token": "<token or null>", "language": "en", "age": "not_applicable" }
```
- `language`: the page's language (`pt` for pt-BR). Missing or malformed: the profile's locale, never a fallback to English.
- `age`: the client's claim about the store's age answer: `adult`, `minor`, `unknown` (only where the store signal applies) or `not_applicable` (the web, and anywhere the signal doesn't apply). Missing: `not_applicable`. **A claim, not proof:** the store's answer stays on the device, which blocks the app itself. The server's own age fact is the self-declared `age_18` consent row.

→ `200 { "available": false, "reason": "off", "pictures": false, "limits": { "max_chars": 2000 } }`

`reason` is `null` when Bo is available, else the first switch that says no, in this order:

| `reason` | Switch (021 and earlier) | Client |
|---|---|---|
| `off` | `bo_live` or `ai_enabled_global` off | No button |
| `region_off` | The signed token's country isn't in `bo_regions` | No button |
| `region_unknown` | No good token | No button |
| `language_off` | The language isn't in `bo_languages` (en, es, fr, pt) | No button |
| `age` | `bo_adult_only` and no `age_18` row, or a claim of `minor`, or `unknown` | No button |
| `budget` | The month's spend reached `org_monthly_budget_usd`, or no model | The button, and "Bo isn't available right now" with help |
| `bo_off` | The person's own "Use Bo" is off (018) | No button; Me offers it back |
| `consent` | No AI consent, no `age_18` row, or AI off in settings | The button opens consent |

Stops such as the daily limit come back on `send`.

**Every switch is read on every request,** so a change takes effect on the next one. Clients ask again at app open and when Bo opens, so a button can stay up to the next of those. Someone mid-conversation when a switch turns off gets the refusal on their next send: a neutral message with help on screen. **Off never removes** Clear, Export, Delete account or Report: those don't go through `bo`, and `supabase/tests/bo_switches.sql` holds them with every switch off. Me's "Your conversation with Bo" row stays.

**Send**
```json
{ "action": "send", "client_key": "<uuid>", "region_token": "<token or null>", "text": "…" }
```
- `client_key`: a new uuid per send, re-sent unchanged on a retry of that send. The same key returns the stored answer, with nothing re-run. On a replay, `show_help` and `open_card` are true if the stored reply carries the fixed help line, since flags aren't stored. So a replay of a refused turn may open the card too.
- A retry while the first is still running answers `in_progress`: show "wait" and retry once. With a match it gets the fixed reply instead, and only the first to finish is saved.
- The client never sends history. The server reads it.
- `picture` isn't accepted yet: it answers `pictures_off`.
- Worst case about 56 s: the 45 s model budget, plus up to 3 s for the status read and 8 s to create a profile on a first send. **Clients wait 60 s**.

→ `200`
```json
{ "reply": "…", "show_help": false, "open_card": false, "show_notice": false, "conversation_full": false }
```
- `show_help` and `open_card`: this turn is flagged. Never persist or log them, and keep them out of Sentry (rule 6(e)).
- `show_notice`: show the "Bo is an AI" notice, then call the RPC `bo_notice_shown()` once it's really on screen, and only then, or the timer resets.
- `conversation_full: true`: the person is past the row cap, so nothing more is kept. Say the conversation is full and offer Clear, with Export first.
- Render `reply` as plain text, with no tappable links.

## Errors
`{ "error": "<code>" }`. **Every one renders with help on screen.** Offline, a 500 or a timeout comes from the client's own fixed text, with help and Retry.

| Code | HTTP | Meaning | UI |
|---|---|---|---|
| `invalid_value` | 400 | Empty, too long, or a bad body | Disable Send; generic |
| `not_authenticated` | 401 | No session | Sign in |
| `ai_consent_required` | 403 | No AI consent, no 18+ row, or AI off in settings | The consent flow; nothing sent |
| `region_off` | 403 | A valid token with an unlisted country | "Bo is available in selected countries" |
| `language_off` | 403 | The language isn't one Bo is evaluated in | A neutral message |
| `age_off` | 403 | The age switch (see `status`) | A neutral message |
| `bo_off` | 403 | The person turned Bo off | Offer it back in Me |
| `bo_unavailable` | 403 | This account is stopped, by us or by Anthropic | A neutral message that never mentions a report or a reason; help stays reachable |
| `needs_email` | 403 | Anonymous accounts are switched off (`bo_anon_enabled`) | Offer Back up |
| `pictures_off` | 403 | Pictures aren't available | Kind message |
| `pictures_need_email` | 403 | Pictures need an email account | Offer Back up |
| `in_progress` | 409 | Another send is running | Wait |
| `rate_limited` | 429 | Too fast | Wait |
| `daily_limit` | 429 | The day's messages are used | Friendly limit message |
| `picture_limit` | 429 | The day's pictures are used | Kind message |
| `region_unknown` | 503 | No good token, or the route failed | "Bo isn't available right now" |
| `bo_not_available` | 503 | Bo is off, or the month's budget is reached | "Bo isn't available right now" |
| `bo_failed` | 502 | The call or a check failed | Retry; the message stays on screen |

## Region token
From the web's `GET /api/region`: `{ "token": "<payload>.<sig>" }` or `{ "token": null }`. The app caches it until `exp`. Anything but a 200 with JSON is no token. An exempt account needs no token. See `specs/bo-design.md` §7.

## What the server does on a send
1. The crisis matcher on the text, in memory.
2. The switches (`bo_available`, 021), from the token's country, the language and the age claim. **A refusal on a match gets the fixed reply and the card, kept,** with no model call, except the person's own `consent` and `bo_off`, which keep nothing.
3. The same key, then length.
4. `bo_begin`. A `{stop}` with a match gets the fixed reply, kept, with no model call, except `ai_consent_required`.
5. History from the database, the window plus up to 5 flagged messages, and the journal if the person's switch is on.
6. The model, then the reply check, on every turn. **Never an unchecked reply.**
7. On a match or the model's signal, the fixed help line is added in code.
8. `bo_finish`: messages saved, request closed, real cost in `ai_spend_daily`.

## Anthropic user profiles
Every model call carries `anthropic-user-profile-id` and a hashed `metadata.user_id`. No profile, no model call. The profile holds only `reference_id`, an HMAC of the account id. Enforcement status is read on each send and never stored. Deletion: Delete account and the 12-month sweep leave the id in an outbox, cleared when someone next opens Bo, so **deletion at Anthropic waits for the next Bo traffic**, and **Anthropic keeps its own trust and safety records for that id**. Vitor's privacy wording covers both.

## Rule 6
Logs are one line, `[bo] outcome=<code>`, the same shape with or without a match: no text, tokens, cost, model, ids or IP. `bo` rows in `ai_requests` hold no usage.
