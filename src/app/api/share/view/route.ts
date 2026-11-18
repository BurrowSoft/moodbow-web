import { NextResponse } from "next/server";
import { draftsAllowed, pageGate } from "@/lib/conditions";
import { readSharedWeek } from "@/lib/plus/serviceRole";
import { parseSharedWeek, RESPONSE_FLOOR_MS, tokenHash, weekAsked, type SharedWeek } from "@/lib/share/trustedShare";

// The shared-week viewer's only way in (1.4 G; plans/PLAN-trusted-share.md §3–§6; the Reviewer's
// blockers 1 and 2). The /s page POSTs {token, week} here after "Show the week":
// - the token came from the URL fragment, so it's never in a request URL or a log line;
// - it's checked (43 base64url characters) and hashed here, and only its sha256 goes to
//   share_view, which only the service role can call;
// - every answer is either the checked week or {"status":"unavailable"}, after the same floor,
//   whatever the cause (unknown, expired, stopped, capped, consents gone, the flag off);
// - nothing is logged: no token, no hash, no week, no IP.
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;
// A body larger than this is no token (the token is 43 characters).
const MAX_BODY = 256;

const UNAVAILABLE: SharedWeek = { status: "unavailable" };
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

// On a test build only (a Preview, dev, CI; never Production, where draftsAllowed() is false): two
// non-secret headers say which step answered, so a Preview's "unavailable" can be traced (the Web
// Tester's #363 row). Never the token, the hash or the key: a reason code and the database's host.
type Trace = { reason: string; host?: string };
async function answer(started: number, body: SharedWeek, trace: Trace): Promise<NextResponse> {
  const left = RESPONSE_FLOOR_MS - (Date.now() - started);
  if (left > 0) await wait(left);
  const headers: Record<string, string> = { ...HEADERS };
  if (draftsAllowed()) {
    headers["X-Share-Reason"] = trace.reason;
    if (trace.host) headers["X-Share-Db-Host"] = trace.host;
  }
  return NextResponse.json(body, { headers });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (pageGate("trusted-share-live") === "hidden") return new NextResponse(null, { status: 404, headers: HEADERS });
  const started = Date.now();
  let input: { token?: unknown; week?: unknown } = {};
  try {
    const text = await request.text();
    if (text.length <= MAX_BODY) input = JSON.parse(text) as typeof input;
  } catch {
    input = {};
  }
  const hash = tokenHash(input?.token);
  if (!hash) return answer(started, UNAVAILABLE, { reason: "bad-token" });
  const read = await readSharedWeek(hash, weekAsked(input?.week)).catch(() => ({ ok: false as const, reason: "threw", host: undefined }));
  if (!read.ok) return answer(started, UNAVAILABLE, { reason: read.reason, host: read.host });
  const parsed = parseSharedWeek(read.value);
  // The database said unavailable, or it said ok in a shape we don't pass on.
  const said = (read.value as { status?: unknown } | null)?.status;
  return answer(started, parsed, { reason: parsed.status === "ok" ? "ok" : said === "ok" ? "parse" : "db-unavailable", host: read.host });
}
