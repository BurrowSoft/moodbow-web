import { FunctionsHttpError } from "@supabase/supabase-js";
import { BO_SERVER_WAIT_MS, boErrorOutcome, boPictureField, parseBoSend, parseBoStatus } from "@/lib/journal/bo";
import { isUuid } from "@/lib/journal/reflect";
import { pageGate } from "@/lib/conditions";
import { regionTokenFor } from "@/lib/regionToken";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The worst case is about 56 s (bo.md): above the server's and the browser's waits.
export const maxDuration = 65;

// Bo's calls from the browser. A plain request, not a server action: Next runs those
// one at a time, so a send of up to a minute would hold Me → Sign out and everything
// else behind it (#166). The session stays in its cookies, and the region token is
// signed here and never reaches the browser. Nothing is logged, and the response's
// flags aren't stored (bo.md, rule 6). Same-origin only.
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  if (pageGate("bo-live") === "hidden") return new Response(null, { status: 404 });
  if (!sameOrigin(req)) return json({ status: "error", code: "invalid_value" }, 403);
  let input: { action?: unknown; client_key?: unknown; text?: unknown; picture?: unknown };
  try {
    input = (await req.json()) as typeof input;
  } catch {
    return json({ status: "error", code: "invalid_value" }, 400);
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return json({ status: "no_answer" });
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) return json({ status: "error", code: "not_authenticated" });

  // The notice really reached the screen (bo.md: only then, or the timer resets).
  if (input.action === "notice_shown") {
    const { error } = await supabase.rpc("bo_notice_shown");
    return json({ ok: !error });
  }

  const send = input.action === "send";
  if (send && (!isUuid(input.client_key) || typeof input.text !== "string")) return json({ status: "error", code: "invalid_value" }, 400);
  if (!send && input.action !== "status") return json({ status: "error", code: "invalid_value" }, 400);

  // A picture only where its flag allows, and only as the browser's re-encoded JPEG. The
  // function checks it again, and it goes no further than that call: never logged.
  const picture = send && input.picture !== undefined ? boPictureField(input.picture) : undefined;
  if (send && input.picture !== undefined && (!picture || pageGate("bo-pictures-live") === "hidden")) return json({ status: "error", code: "invalid_value" }, 400);

  const region_token = regionTokenFor(req.headers);
  let answer: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    answer = await supabase.functions.invoke("bo", {
      body: send ? { action: "send", client_key: input.client_key, region_token, text: input.text, ...(picture ? { picture } : {}) } : { action: "status", region_token },
      headers: { Authorization: `Bearer ${token}` },
      timeout: BO_SERVER_WAIT_MS,
    });
  } catch {
    return json({ status: "no_answer" });
  }
  const { data, error } = answer;
  if (error) {
    // A gateway's own page isn't the function's answer; the same key is resent.
    if (!(error instanceof FunctionsHttpError)) return json({ status: "no_answer" });
    const code = await (error.context as Response)
      .json()
      .then((b: { error?: unknown }) => b?.error)
      .catch(() => undefined);
    return json(boErrorOutcome(code));
  }
  return json(send ? parseBoSend(data) : parseBoStatus(data));
}
