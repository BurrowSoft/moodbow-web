import { saveCheckIn } from "@/app/[locale]/app/actions";

// Me → Sign out's one sync try for check-ins saved offline (#147), as a plain
// request rather than a server action: Next runs server actions one at a
// time, so a sync that hung would hold the sign-out action behind it (Web
// Tester: 60 s). A fetch can be aborted at the 5 s cap, and nothing waits in
// the action queue. The save itself is saveCheckIn's, the same rules as the
// card. Same-origin only: a route handler has no server action's origin
// check. The answer is the save's status only, never the check-in.
export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== new URL(req.url).host) return Response.json({ status: "error" }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ status: "error" }, { status: 400 });
  }
  try {
    const result = await saveCheckIn({ status: "idle" }, form);
    return Response.json({ status: result.status });
  } catch {
    // A redirect (the session ended) or anything else: not saved, so the
    // check-in stays and the dialog asks about it.
    return Response.json({ status: "error" });
  }
}
