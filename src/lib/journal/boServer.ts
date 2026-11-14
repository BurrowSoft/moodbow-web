import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { BO_SERVER_WAIT_MS, boErrorOutcome, boLanguage, parseBoSend, parseBoStatus, type BoSend, type BoStatus } from "./bo";
import { regionTokenFor } from "@/lib/regionToken";

// Bo's function, from our server only, with the person's session and a region token signed
// here (bo.md). Every request carries the page's language, as the function falls back to the
// profile's, and the web's age claim, not_applicable: it has no store age signal. Nothing is
// logged, and the flags in an answer aren't stored (rule 6).
export async function callBoFunction(
  supabase: SupabaseClient,
  headers: Headers,
  route: string,
  body: { action: "status" } | { action: "send"; client_key: string; text: string; picture?: { media_type: string; data: string } },
  timeout = BO_SERVER_WAIT_MS,
): Promise<BoSend | BoStatus> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) return { status: "error", code: "not_authenticated" };
  let answer: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    answer = await supabase.functions.invoke("bo", {
      body: { ...body, region_token: regionTokenFor(headers), ...(route ? { language: boLanguage(route) } : {}), age: "not_applicable" },
      headers: { Authorization: `Bearer ${token}` },
      timeout,
    });
  } catch {
    return { status: "no_answer" };
  }
  const { data, error } = answer;
  if (error) {
    // A gateway's own page isn't the function's answer; the same key is resent.
    if (!(error instanceof FunctionsHttpError)) return { status: "no_answer" };
    const code = await (error.context as Response)
      .json()
      .then((b: { error?: unknown }) => b?.error)
      .catch(() => undefined);
    return boErrorOutcome(code);
  }
  return body.action === "send" ? parseBoSend(data) : parseBoStatus(data);
}
