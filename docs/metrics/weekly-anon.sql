-- Weekly no-sign-up counts (decision 216): UX & PM's read, first on
-- 2026-11-10. Drafted by Web Dev for UX's review; NOT run anywhere yet.
--
-- Read-only and counts only: no ids, emails or journal text leave the
-- database. The leading SET TRANSACTION READ ONLY makes any write fail,
-- and the SQL editor still shows the rows.
-- It needs postgres (auth.* isn't readable by the client roles).
--
-- Who runs it:
--   staging  Web Dev, in a slot from UX & PM, first with the check below
--   prod     Vitor, pasting it into the Supabase SQL editor (read-only),
--            first on 2026-11-10; UX & PM reads the result
--
-- Staging check, before the first prod read: one fresh email sign-up and
-- one anonymous account backed up (email confirmed) a few minutes after
-- it was created. Expected: the email sign-up isn't counted at all; the
-- backed-up one is in anon_created and converted. That confirms both rules
-- below (started anonymous; converted).
--
-- One row per ISO week (Monday, UTC) in which accounts were created:
--   anon_created        (a) anonymous accounts created that week
--   converted           (b) of those, how many have added an email since
--   checked_in_first_7d (c) of those, how many saved ≥ 1 check-in within
--                           7 days of being created
--   no_email_at_30d     (d) of those ≥ 30 days old, how many had no email
--                           30 days after being created; NULL while none
--                           of the week's accounts is 30 days old yet
--   d_measurable        how many of the week's accounts are ≥ 30 days old
--                       (d's denominator; the whole week once it's past)
--
-- Relies on (Supabase auth + migrations 001/002/013):
--   auth.users       id, created_at, is_anonymous, email_confirmed_at
--   auth.identities  user_id, provider, created_at
--   public.check_ins user_id, created_at (when it was saved, not
--                    local_date, which can be an earlier day)
--
-- Caveat for (c): check_ins.created_at is when the server received the
-- check-in. One saved offline on the phone syncs later, so a check-in made
-- on day 6 that syncs on day 8 isn't counted; (c) can read slightly low.
--
-- "Started anonymous", the one assumption to confirm on staging: linking
-- an email clears is_anonymous, and nothing else records how an account
-- started. An email sign-up gets its 'email' identity in the same request
-- as the user (milliseconds apart); an anonymous account gets one only when
-- it links an email (Back up), later. So an account started anonymous if
-- it still is, or if its email identity came more than a minute after the
-- account (the staging check above). Accepted blind spot (UX): an
-- anonymous account backed up within its first minute isn't counted at
-- all. Google/Apple sign-in (H) would need its own rule; it isn't live.
--
-- Converted = no longer anonymous and the email confirmed (a link that's
-- only pending isn't a backup, as in 013). Its date is
-- auth.users.email_confirmed_at, never the identity's created_at: the
-- identity can come when the link is requested, before it's confirmed.
-- The identity is used only for "started anonymous" above.
--
-- Not counted: deleted accounts (Delete account, and the 12-month sweep in
-- 013, cascade from auth.users), so a week's numbers can drop later.
-- Staging fixture accounts are counted on staging; read staging for the
-- shape, prod for the numbers.

SET TRANSACTION READ ONLY;

WITH accounts AS (
  SELECT
    u.id,
    u.created_at,
    u.is_anonymous,
    u.email_confirmed_at,
    (SELECT min(i.created_at) FROM auth.identities i
      WHERE i.user_id = u.id AND i.provider = 'email') AS email_linked_at
  FROM auth.users u
),
anon AS (
  SELECT
    a.*,
    (NOT a.is_anonymous AND a.email_confirmed_at IS NOT NULL) AS converted
  FROM accounts a
  WHERE a.is_anonymous
     OR a.email_linked_at > a.created_at + interval '1 minute'
)
SELECT
  to_char(date_trunc('week', a.created_at AT TIME ZONE 'UTC'), 'IYYY-"W"IW') AS iso_week,
  (date_trunc('week', a.created_at AT TIME ZONE 'UTC'))::date AS week_start,
  count(*) AS anon_created,
  count(*) FILTER (WHERE a.converted) AS converted,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.check_ins c
    WHERE c.user_id = a.id
      AND c.created_at < a.created_at + interval '7 days'
  )) AS checked_in_first_7d,
  count(*) FILTER (WHERE a.created_at + interval '30 days' <= now()) AS d_measurable,
  CASE WHEN count(*) FILTER (WHERE a.created_at + interval '30 days' <= now()) > 0
    THEN count(*) FILTER (
      WHERE a.created_at + interval '30 days' <= now()
        AND NOT (a.converted AND a.email_confirmed_at <= a.created_at + interval '30 days')
    )
  END AS no_email_at_30d
FROM anon a
GROUP BY 2, 1
ORDER BY week_start;
