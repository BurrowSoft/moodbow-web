import { saveCheckIn } from "@/app/[locale]/app/actions";
import { sameOrigin } from "@/lib/http/sameOrigin";

// Every check-in sync (a copy saved offline: Today's reconnect flush and Me →
// Sign out's one try, #147) as a plain request rather than a server action:
// Next runs server actions one at a time, so a sync that hung would hold the
// sign-out action behind it (Web Tester: 60 s, #166). A fetch can be aborted,
// and nothing waits in the action queue. The save itself is saveCheckIn's,
// the same rules as the card, and the answer is its result (what the server
// action returned to the card before). Same-origin only (lib/http/sameOrigin).

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return Response.json({ status: "error", error: "generic" }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ status: "error", error: "generic" }, { status: 400 });
  }
  try {
    return Response.json(await saveCheckIn({ status: "idle" }, form));
  } catch {
    // A redirect (the session ended, or consent is needed) or anything else:
    // not saved, and a background sync doesn't navigate. "generic" keeps the
    // copy for the next try, as a dropped connection would.
    return Response.json({ status: "error", error: "generic" });
  }
}
