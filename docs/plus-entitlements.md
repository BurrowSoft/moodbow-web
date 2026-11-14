# Moodbow Plus: the entitlements row (design note, decision 246)

Web Dev, 11 Nov 2026. Draft for the Mobile Dev's migration (moodbow-app
`supabase/`), the Reviewer's read and UX. The spec is
apps/moodbow/specs/plus.md. Nothing here goes live before the pilot is
published, and the `plus` flag stays off until everything ships.

## One row per person

`public.entitlements`, one row per account, whichever store sold Plus:

| column | type | notes |
|---|---|---|
| `user_id` | uuid, primary key, references `auth.users(id)` on delete cascade | one row per person |
| `source` | text, not null, check in (`stripe`, `play`, `apple`) | where Plus was bought |
| `status` | text, not null, check in (`trialing`, `active`, `past_due`, `paused`, `canceled`, `expired`) | the store's state, mapped (below) |
| `trial_ends_at` | timestamptz, null | end of the 7 free days, while there is a trial |
| `current_period_end` | timestamptz, null | when the paid year (or the trial) runs out |
| `trial_started_at` | timestamptz, null | set once, never cleared: one free trial per person on the web |
| `store_customer_id` | text, null | Stripe customer `cus_…`; null for the stores |
| `store_subscription_id` | text, null | Stripe `sub_…`, Play purchase token, Apple original transaction id |
| `store_product_id` | text, null | Stripe price `price_…`, Play product id, Apple product id |
| `updated_at` | timestamptz, not null, default now() | |

Unique index on (`source`, `store_subscription_id`) where it isn't null, so a
store notification finds its row.

## Who writes, who reads

- **RLS on, read own row only:** `select using (auth.uid() = user_id)`. No
  insert, update or delete policy: no client ever writes it, on the app or the
  web.
- **Writes are the server's only:** the web's Stripe webhook and checkout (with
  the service role, below), and later the stores' notification functions.
- **Has Plus** = `status in ('trialing','active') and current_period_end > now()`.
  One SQL function, `has_plus(uid)` (stable, SECURITY DEFINER, `search_path`
  pinned), so the app, the web and any server feature check the same rule.
  `past_due`, `paused`, `canceled` and `expired` never grant (SolvyMed's rule:
  a failed renewal cuts Plus at once; a successful retry brings it back).

## Stripe status → `status`

`active` → active · `trialing` → trialing · `past_due` and `unpaid` → past_due ·
`paused` → paused · `canceled` → canceled · `incomplete` and
`incomplete_expired` → expired. The webhook always writes the subscription's
**live** state read back from Stripe, never the event's payload, and re-reads
after writing (out-of-order deliveries).

## Two stores at once

A row from one store isn't overwritten by another while it grants Plus: a
Stripe event can't end an active Play or Apple Plus, and the reverse. A source
may write the row when the row is its own or doesn't grant. The checkout
refuses a second subscription while any source grants Plus.

## Needs a decision

1. **The service role key on the web (Vitor's).** moodbow-web has never held
   `SUPABASE_SERVICE_ROLE_KEY`. The webhook, which has no signed-in person,
   needs a server writer. Two ways:
   - (a) the key on Vercel, Production and Preview, used only by
     `api/webhooks/stripe` and `api/cron/*` (SolvyMed's way); or
   - (b) no key on the web: a SECURITY DEFINER function
     `entitlement_write(...)` that only the `service_role` may execute, called
     from a Supabase Edge Function that receives the Stripe webhook (the app
     repo's).

   I recommend (a): it's SolvyMed's tested pattern and keeps Stripe code in
   one place. Either way, the key or the function's secret is Vitor's to set.
2. **Deleting an account with a live Stripe subscription.** Today
   `delete_my_account` deletes the account, and the row would cascade away,
   but Stripe would keep charging every year. Proposal:
   - On the web, Delete account cancels the Stripe subscription (immediately,
     with no refund; refunds are Vitor's) before the RPC. If Stripe can't be
     reached, the deletion still goes ahead, and the next step catches it.
   - For a deletion from the app: `delete_my_account` copies a live Stripe
     `store_subscription_id` into `stripe_cancel_queue` (service-only, no RLS
     access) before it deletes, and a daily web cron cancels those. The
     reconcile cron stays read-only.
   - Play and Apple subscriptions can't be cancelled by us. The delete
     confirmation says to cancel in the store (copy is UX's; Vitor's legal
     read).
3. **The price.** One yearly Stripe Price with `currency_options`, made by
   Vitor in the Stripe Dashboard (prices are his). The web reads only its id,
   `STRIPE_PLUS_PRICE_ID`. The checkout never sends an amount.

## Environment (all Vitor's to set; nothing calls Stripe until then)

`STRIPE_SECRET_KEY` (test mode on Preview first), `STRIPE_WEBHOOK_SECRET`
(after he makes the endpoint `https://<host>/api/webhooks/stripe` for the
events `checkout.session.completed`, `customer.subscription.created`,
`.updated`, `.deleted`, `invoice.payment_failed`), `STRIPE_PLUS_PRICE_ID`,
`CRON_SECRET` (the reconcile cron), and the service role per decision 1.
