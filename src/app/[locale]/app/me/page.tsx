import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../TabPlaceholder";
import { signOut } from "./actions";
import { YourData } from "./YourData";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me">): Promise<Metadata> {
  return tabMetadata("tabMe", (await params).locale);
}

// Me (M7). This part: Your data (export, delete account) and Sign out. The
// other sections (AI, reminder, language & region, help) follow in the
// order the spec lists them.
export default async function MePage({ params }: PageProps<"/[locale]/app/me">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  const t = await getTranslations("app");

  return (
    <section className="space-y-8">
      <h1 className="text-3xl font-medium tracking-tight">{t("tabMe")}</h1>
      <YourData credits={me.credits?.balance ?? 0} uid={user.id} />
      <form action={signOut}>
        <button
          type="submit"
          data-testid="me-sign-out"
          className="inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent hover:bg-pill"
        >
          {t("meSignOut")}
        </button>
      </form>
    </section>
  );
}
