import { NextResponse, type NextRequest } from "next/server";
import type { Locale } from "@/i18n/routing";
import { CONFIRM_FAILED, confirmTarget, keepsSession, parseConfirmLink, type ConfirmTarget } from "@/lib/authConfirm";
import { liveFeatures } from "@/lib/liveFeatures";
import { localizedPath } from "@/lib/metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /auth/confirm?token_hash=…&type=…  (see lib/authConfirm.ts)
// Verifies the token server-side against this deployment's Supabase project,
// then 303s to a clean URL. Nothing here logs: the token must never reach
// logs or Sentry (Sentry also strips query strings).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: RouteContext<"/[locale]/auth/confirm">) {
  const { locale } = await params;
  let target: ConfirmTarget = CONFIRM_FAILED;

  const link = parseConfirmLink(req.nextUrl.searchParams);
  const supabase = link ? await createSupabaseServerClient() : null;
  if (link && supabase) {
    const { data, error } = await supabase.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash });
    if (!error) {
      target = confirmTarget(link.type, !!data.session);
      if (!keepsSession(link.type, liveFeatures.webJournal)) await supabase.auth.signOut({ scope: "local" });
    }
  }

  const url = new URL(localizedPath(locale as Locale, target.path), req.nextUrl.origin);
  if (target.result) url.searchParams.set("result", target.result);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
