import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { signedOutReason } from "@/lib/supabase/proxy";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// The signed-in person for a journal page. ended: Auth says there's no session
// (no cookie, or it was revoked): a page says so (SessionEnded). An outage, a
// rate limit or any other error isn't an ended session: the page's error state,
// with Try again.
export async function currentUser(supabase: Client): Promise<{ user: User | null; ended: boolean }> {
  if (!supabase) return { user: null, ended: false };
  const { data, error } = await authUser(supabase);
  return { user: data.user, ended: !data.user && signedOutReason(error, true) !== null };
}

// Auth's getUser, once per request render for the shared client (React's cache): the journal's
// layout and its page both ask, and each ask was a round trip to Auth (the Web Dev's LCP read,
// 12 Nov). Outside a render it isn't memoized.
export const authUser = cache((supabase: NonNullable<Client>) => supabase.auth.getUser());
