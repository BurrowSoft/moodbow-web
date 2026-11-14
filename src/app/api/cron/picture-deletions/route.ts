import { captureMessage } from "@sentry/nextjs";
import { conditionMet } from "@/lib/conditions";
import { clearPictureQueue, failPictureQueue, readPictureQueue, removePictureFiles, serviceRoleConfigured } from "@/lib/plus/serviceRole";
import { cronAuthorized } from "@/lib/plus/stripeReconcile";
import { underOwnFolder } from "@/lib/journal/pictureQueue";

// Pictures for moments (035): a row that goes never frees its files, so its trigger queues both
// paths in picture_deletions, and this cron deletes them through the Storage API (the Code
// Reviewer's rules, #241):
// - only queued rows, and only a path under that same row's "<user_id>/" (anything else stays
//   queued and is counted as refused: never deleted);
// - in batches of 100 within a time budget; a file already gone counts as done (it may run twice);
// - a failed batch stays queued with its attempts counted; past 5 it's reported (counts only);
// - the logs and the answer hold counts only, never a path or an id.
// The files are only gone once this runs: its schedule must be on before pictures-live is met.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 100;
const BUDGET_MS = 45_000;
const REPORT_AFTER = 5;

export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  // Before pictures are set up here (no key, or no 035 yet): a quiet no-op, not a daily error.
  const quiet = (why: string) => {
    console.log(`[picture-deletions] skipped: ${why}`);
    return Response.json({ skipped: why });
  };
  if (!serviceRoleConfigured()) return conditionMet("pictures-live") ? Response.json({ error: "not_configured" }, { status: 503 }) : quiet("not_configured");

  const started = Date.now();
  let deleted = 0;
  let failed = 0;
  let refused = 0;
  let stuck = 0;
  // Rows left queued this run (failed or refused) aren't read again in it.
  const skip = new Set<number>();
  while (Date.now() - started < BUDGET_MS) {
    const read = await readPictureQueue(BATCH + skip.size);
    if (!read.ok) {
      if (deleted + failed + refused === 0) return conditionMet("pictures-live") ? Response.json({ error: "db" }, { status: 500 }) : quiet("no_queue");
      break;
    }
    const batch = read.value.filter((r) => !skip.has(r.id)).slice(0, BATCH);
    if (batch.length === 0) break;
    const ok = batch.filter(underOwnFolder);
    const bad = batch.filter((r) => !underOwnFolder(r));
    for (const r of bad) skip.add(r.id);
    refused += bad.length;
    if (ok.length > 0) {
      if ((await removePictureFiles(ok.map((r) => r.path))) && (await clearPictureQueue(ok.map((r) => r.id)))) {
        deleted += ok.length;
      } else {
        await failPictureQueue(ok);
        for (const r of ok) skip.add(r.id);
        failed += ok.length;
        stuck += ok.filter((r) => r.attempts + 1 >= REPORT_AFTER).length;
      }
    }
    if (batch.length < BATCH) break;
  }
  console.log(`[picture-deletions] deleted ${deleted}, failed ${failed}, refused ${refused}`);
  if (stuck > 0 || refused > 0) captureMessage(`Picture deletions: ${stuck} stuck, ${refused} refused`, { level: "error", fingerprint: ["picture-deletions"] });
  return Response.json({ deleted, failed, refused });
}
