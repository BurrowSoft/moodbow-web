"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { isIos } from "@/lib/safety/helplines";
import { APP_STORE_URL, type LiveStores } from "@/lib/stores";
import { PlayStoreLink } from "./PlayStoreLink";

// As the primary button, without its 200 px minimum: at 200% zoom on a phone
// the page is 160 px wide, and the button wraps instead of scrolling sideways.
const BUTTON =
  "mb-2 inline-flex min-h-12 max-w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-center text-base font-medium text-on-accent [overflow-wrap:anywhere] hover:bg-accent-hover sm:hidden";

const noSubscribe = () => () => {};
const platform = () => (/Android/i.test(navigator.userAgent) ? "android" : isIos(navigator.userAgent, navigator.maxTouchPoints) ? "ios" : "other");

// Already in, on the way in, or where the button itself leads.
const staysHidden = (path: string) => path === "/welcome" || path === "/setup" || path === "/app" || path.startsWith("/app/");

// "Try the app" in the footer, on phone widths only (Vitor, UX & PM 2026-11-06).
// The web journal's start for now; each phone goes to its own store once that
// store is public. journal: the start exists here, so the button can't lead to a
// 404 if the journal is ever off with no store live. The server renders the
// journal's link; the browser swaps in the store.
export function TryAppButton({ journal, stores }: { journal: boolean; stores: LiveStores }) {
  const t = useTranslations("common");
  const path = usePathname();
  const phone = useSyncExternalStore(noSubscribe, platform, () => "other");
  if (staysHidden(path)) return null;
  const className = BUTTON;
  if (phone === "android" && stores.play) {
    return (
      <PlayStoreLink className={className} testId="try-app">
        {t("tryApp")}
      </PlayStoreLink>
    );
  }
  if (phone === "ios" && stores.appStore && APP_STORE_URL) {
    return (
      <a href={APP_STORE_URL} data-testid="try-app" className={className}>
        {t("tryApp")}
      </a>
    );
  }
  if (!journal) return null;
  return (
    <Link href="/welcome" data-testid="try-app" className={className}>
      {t("tryApp")}
    </Link>
  );
}
