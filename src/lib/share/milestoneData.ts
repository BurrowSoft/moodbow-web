import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { latestBands, milestoneFor, MILESTONE_BANDS, type Milestone } from "./cards";
import type { MonthCheckIn } from "./moodbow";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

// The milestone card's data (decision 169): the total days journaled (one
// check-in per day, so the check-in count) and the latest ≤ 31 check-ins'
// moods, in one RLS read of the person's own rows. Null below the first
// milestone or when the read fails (no card then).
export async function loadMilestone(supabase: Supabase): Promise<{ n: Milestone; colours: string[] } | null> {
  const { data, count, error } = await supabase
    .from("check_ins")
    .select("local_date, mood", { count: "exact" })
    .order("local_date", { ascending: false })
    .limit(MILESTONE_BANDS);
  if (error || count === null) return null;
  const n = milestoneFor(count);
  return n ? { n, colours: latestBands((data ?? []) as MonthCheckIn[]) } : null;
}
