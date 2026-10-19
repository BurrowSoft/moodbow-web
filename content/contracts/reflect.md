# `reflect`: "Reflect with Moodbow" (M9, decision 103)

One server path for app and web: the Supabase edge function `reflect`, called with the **user's JWT** (`functions.invoke`). The client never talks to Anthropic, never holds a key and never sends entry text; the server reads the entry by id as that user. Behaviour and prompt: `specs/m9-ai-reflections.md`. DB side: migration 006.

**Callers:** the app (`functions.invoke` with the user's session) and the web **server-side only** (a server action with the user's session). The function sends **no CORS headers**, so browsers can't call it directly; keep it that way.

## Request
`POST /functions/v1/reflect`
```json
{ "entry_id": "<uuid>", "client_key": "<uuid>" }
```
- `client_key`: a **new uuid per tap**, kept and **re-sent unchanged on any retry of that same tap**, until the tap resolves (success or a final error).
- **The client disables Reflect while a tap is in flight** (required).
- Server-side, two guards: (1) the same `client_key` → `in_progress` while running, a replay after; (2) **one reflection in flight per entry**: another started request for the same (user, entry) within 2 min → `in_progress`, whatever its key. So a retry, a double-tap, or two tabs/devices on the same entry never run the model twice or debit twice.

## 200
```json
{
  "reflection": { "id": "<uuid>", "entry_id": "<uuid>", "body": "…", "tier": "full", "created_at": "…" },
  "credits": { "balance": 691, "tier_now": "full" }
}
```
The same `client_key` after success → the **same** 200 (a replay; nothing runs, nothing is debited). If that reflection was replaced or deleted since, the replay is `not_found`.

## Errors: `{ "error": "<code>" }`
| HTTP | code | When | Client |
|---|---|---|---|
| 400 | `invalid_value` | Bad body (not uuids) | reflectError |
| 401 | `not_authenticated` | No/expired JWT | the usual session handling |
| 403 | `ai_disabled` | The global switch is off | hide AI (get_me().ai_available) |
| 403 | `ai_consent_required` | No current AI consent, or AI off in settings | meAiOffHint |
| 404 | `not_found` | Entry missing / not the user's (indistinguishable) | reflectError |
| 409 | `in_progress` | The same client_key is still running, or another reflection of this entry is (another tab/device) | keep reflectLoading; **retry the same client_key** after ~2 s (up to ~30 s), then the 200 replays. Don't poll by entry_id (that could show the old reflection). |
| 429 | `rate_limited` | Over the per-user limit (5/min, 60/h; app_config) | errRateLimited |
| 429 | `daily_limit` | Lite allowance used up today | dailyLimit |
| 503 | `ai_budget_exhausted` | The org monthly cap (users never see "budget") | reflectError |
| 502 | `reflect_failed` | Model refusal, `max_tokens`, empty reply, upstream error/timeout | reflectError ("…Your entry is saved.") |

Network failure / no response → errOffline. Retry with the **same** client_key (safe).

## Reads, deletes, credits
- Read: `select` on `ai_reflections` where `entry_id = …` (RLS: own rows; at most one per entry).
- Delete (reflectDelete): an RLS `delete` on `ai_reflections` by `id` (policy + grant since 003). No RPC.
- Credits screen: `get_my_credits()`.
- Gate: `get_me().ai_available` **and** a current `ai` consent **and** `settings.ai_enabled`; otherwise no Reflect button.

## Me → AI
- On: `record_consents([{kind: "ai", version: <current>, granted: true}])`, then `update_settings(p_ai_enabled => true)`.
- Off: `update_settings(p_ai_enabled => false)`, then `record_consents([{kind: "ai", version: <current>, granted: false}])` (a recorded withdrawal).
- Tone / focus: `update_settings(p_tone, p_focus_areas)`.

## Server steps (for review)
1. Verify the JWT → `uid`. Validate the body.
2. `ai_begin_request(uid, 'reflection', client_key, entry_id)` (after confirming the entry is the user's). A replay (`replay: true`): if `succeeded`, return the stored reflection (by `request_id`); if `failed`, return `reflect_failed`.
3. Read the entry (`id`, `uid`) plus the last 7 days of check-ins (numbers only), tone, focus and locale.
4. Call the model (`ai_models[tier]`; spec settings). **Whatever happens after a billed call, the request is closed**:
   - success → `ai_complete_reflection(...)`, which prices by `response.model` (incl. thinking in output_tokens, and cache read/write), debits and replaces the entry's reflection in one transaction;
   - refusal / max_tokens / error → `ai_finish_request(..., 'failed', <code>)` with the real usage if any (logged, never debited).
5. Close the request in a `finally`: any path that doesn't reach complete/finish (a thrown error, a timeout) calls `ai_finish_request(..., 'failed', 'internal_error')`. If the function itself dies, the next begin of that user reaps its started rows older than 5 min as failed `abandoned`.
6. Never log, store in ai_requests or send to Sentry any prompt, entry or reply text.

## Prices and models
`ai_models` and `model_prices` are config rows seeded by migration 006. **Changing a price or a model takes its own reviewed migration** (never a hand edit in the dashboard), with UX's OK like any migration.
