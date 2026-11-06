import { pageGate } from "@/lib/conditions";
import { regionTokenFor } from "@/lib/regionToken";

// The signed country token for the app (specs/bo-design.md §7). The web doesn't
// call this: it signs on its server, so the token never reaches a browser. No
// auth, no cookies, nothing read but the country header, nothing logged or stored
// by this code; Vercel's own logs still record the request. Outside the locale and
// session proxy (src/proxy.ts's matcher skips /api). Unknown country or no secret:
// { token: null }, never an error, and the function treats that as off.
export function GET(req: Request): Response {
  if (pageGate("region-live") === "hidden") return new Response(null, { status: 404 });
  return Response.json({ token: regionTokenFor(req.headers) }, { headers: { "Cache-Control": "no-store" } });
}
