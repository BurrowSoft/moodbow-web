import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { pageGate } from "@/lib/conditions";
import { getMe, onboardingStep } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { AppNav } from "./AppNav";

// The signed-in web journal. Behind web-journal-live: the proxy 404s /app on
// Production until it's met; this check is the backstop. Signed-out visitors
// go to sign-in; anyone without current consents goes to Consent, then Set up
// until onboarded (M3, same as the app). Data access is enforced by RLS and
// the RPCs, not by these redirects.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();

  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return redirect({ href: "/sign-in", locale });

  const me = await getMe(supabase);
  // Signed in but the data didn't load: an error state, not a redirect loop.
  if (!me) return <JournalUnavailable />;
  const step = onboardingStep(me);
  if (step === "consent") redirect({ href: "/consent", locale });
  if (step === "setup") redirect({ href: "/setup", locale });

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AppNav />
      <main id="main" className="flex-1 px-6 pb-28 pt-10 md:pb-10">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
