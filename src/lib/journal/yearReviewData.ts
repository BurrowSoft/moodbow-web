import { pageGate } from "@/lib/conditions";
import { readCheckInsSince } from "@/lib/plus/insightsData";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewYear, yearReview, type YearHelp, type YearMoment, type YearReview, type YearTag } from "./yearReview";
import { yearOnOffer } from "../share/year";

// Your year in Moodbow's reads (1.4 A), as the person themselves (RLS), nothing written. Check-in
// values; the moments' ids and dates, never their text; Things that help me; and, only where tags
// are on, the year's tags. In December and January the year is fixed, so one read of it; otherwise
// every check-in up to the end of last year, to find the newest complete year with 30 days.
// null: a read the review needs failed (the page's error state). Tags or Things that help me that
// can't be read leave their part out, never a guess.
type Client = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export async function loadYearReview(supabase: Client, today: string): Promise<YearReview | null> {
  const fixed = yearOnOffer(today);
  const last = Number(today.slice(0, 4)) - 1;
  const checkIns = await readCheckInsSince(supabase, fixed === null ? null : `${fixed}-01-01`, fixed === null ? `${last}-12-31` : `${fixed}-12-31`);
  if (!checkIns) return null;
  const year = reviewYear(today, checkIns);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const tagsOn = pageGate("tags-live") !== "hidden";
  const [moments, helps, tags] = await Promise.all([
    supabase.from("entries").select("id, entry_date").eq("is_moment", true).gte("entry_date", from).lte("entry_date", to),
    supabase.from("toolbox_items").select("text, position").order("position"),
    tagsOn ? supabase.from("check_in_tags").select("local_date, tag, created_at").gte("local_date", from).lte("local_date", to) : null,
  ]);
  if (moments.error) return null;
  return yearReview({
    today,
    checkIns,
    moments: (moments.data ?? []) as YearMoment[],
    helps: helps.error ? [] : ((helps.data ?? []) as YearHelp[]),
    tags: !tags || tags.error ? null : ((tags.data ?? []) as YearTag[]),
    keywords: CRISIS_KEYWORDS,
  });
}
