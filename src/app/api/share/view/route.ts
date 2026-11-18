import { NextResponse } from "next/server";
import { pageGate } from "@/lib/conditions";
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

async function answer(started: number, body: SharedWeek): Promise<NextResponse> {
  const left = RESPONSE_FLOOR_MS - (Date.now() - started);
  if (left > 0) await wait(left);
  return NextResponse.json(body, { headers: HEADERS });
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
  if (!hash) return answer(started, UNAVAILABLE);
  const read = await readSharedWeek(hash, weekAsked(input?.week)).catch(() => ({ ok: false as const }));
  return answer(started, read.ok ? parseSharedWeek(read.value) : UNAVAILABLE);
}
