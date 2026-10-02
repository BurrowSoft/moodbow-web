import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { TabPlaceholder, tabMetadata } from "../TabPlaceholder";
import { signOut } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me">): Promise<Metadata> {
  return tabMetadata("tabMe", (await params).locale);
}

// Me (M7 fills it in). For now: Sign out.
export default async function MePage({ params }: PageProps<"/[locale]/app/me">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("app");
  return (
    <TabPlaceholder titleKey="tabMe">
      <form action={signOut} className="mt-10">
        <button
          type="submit"
          data-testid="me-sign-out"
          className="inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent hover:bg-pill"
        >
          {t("meSignOut")}
        </button>
      </form>
    </TabPlaceholder>
  );
}
