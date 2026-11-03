# Weekly no-sign-up counts: how to run them

For Vitor, first on 2026-11-10, in one sitting: staging first, then the real numbers.

**Nothing here changes data.** The query's first line makes the whole run read-only. It only counts, and it shows no emails or names. The only changes are the two test accounts you create and then delete on staging (steps 2, 3 and 7).

The query is in [weekly-anon.sql](weekly-anon.sql). Each run, copy the whole file.

## Staging: check that it counts right

1. **Before anything, run it once.** In the Supabase dashboard, open the **staging** project, then **SQL Editor** → **New query**. Paste the whole query and press **Run**. Write down this week's row (the last one): `anon_created` and `converted`. If there's no row for this week, write down 0 and 0.
2. **Test account 1, an email sign-up.** On the staging website (https://moodbow-web-git-staging-web-burrowsoft.vercel.app), sign up with an email you can open, for example `you+weekly1@…`. Confirm it from the email.
3. **Test account 2, started without an email, then backed up.** (No staging app on your phone? Ask the team to make test account 2 on the staging emulator. Do step 1 first, and have them make it after that, so it shows up as the +1 in step 5.)
   - On your phone, open the **Moodbow staging** app, signed out, and tap **Skip for now** so it starts without an email.
   - **Wait at least 2 minutes.** The query tells the two kinds of account apart by that gap.
   - Then go to **Me → Back up your journal**, enter a second email you can open (for example `you+weekly2@…`), confirm it from the email, and choose a password.
4. **Run the query again** (step 1's way).
5. **Check this week's row against what you wrote down:**
   - `anon_created` went up by exactly **1**: account 2. Account 1 isn't counted, because it never started without an email.
   - `converted` went up by exactly **1**: account 2 backed up.
   - `no_email_at_30d` is empty (NULL), because nothing from this week is 30 days old yet.

   If either number is off, stop and tell UX & PM; don't run it on production yet.
6. **Send UX & PM the row's numbers** (just the numbers, no emails).
7. **Delete the two test accounts:** on the staging website, account 1 → **Me → Delete account**; in the staging app, account 2 → **Me → Delete account**.

## Production: the real numbers

8. In the Supabase dashboard, open the **production** project, then **SQL Editor** → **New query**. Paste the same whole query and press **Run**.
9. **Send UX & PM the result table.** It's counts only, one row per week. There's nothing to delete afterwards.

## What the columns mean

| Column | Meaning (per week the accounts were created) |
|---|---|
| `anon_created` | accounts started without an email |
| `converted` | of those, how many have added an email since |
| `checked_in_first_7d` | of those, how many saved a check-in in their first 7 days |
| `d_measurable` | how many of that week's accounts are at least 30 days old |
| `no_email_at_30d` | of those, how many still had no email 30 days in (empty until some are 30 days old) |

Deleted accounts aren't counted, so a past week's numbers can go down later.
