"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { originOf, originTab } from "@/lib/journal/origin";
import { Logo } from "@/components/Logo";
import { TAB_ITEM, TAB_LABEL, TAB_LINK_NARROW } from "@/lib/ui/journalLayout";

// The web journal's tabs, the same four as the app (Today · Timeline ·
// Insights · Me) with the same test ids. A sidebar from md up, a bottom bar
// on phones.
const TABS = [
  { href: "/app", key: "tabToday", id: "tab-today", icon: <SunIcon /> },
  { href: "/app/timeline", key: "tabTimeline", id: "tab-timeline", icon: <ListIcon /> },
  { href: "/app/insights", key: "tabInsights", id: "tab-insights", icon: <ChartIcon /> },
  { href: "/app/me", key: "tabMe", id: "tab-me", icon: <PersonIcon /> },
] as const;

export function AppNav() {
  const t = useTranslations("app");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const from = useSearchParams().get("from");
  // An entry page or New entry belongs to the tab it was opened from (Today
  // or the Timeline; Today on a direct load), decision 152.
  const section = pathname.startsWith("/app/entries/") || pathname === "/app/write" ? originTab(originOf(from)) : pathname;
  const isActive = (href: string) => (href === "/app" ? section === "/app" : section === href || section.startsWith(`${href}/`));
  // The current tab again (r1, UX): on its own screen, back to the top
  // (smoothly, unless reduced motion), keeping its filter or range; below
  // it (a day, an entry), the link goes to the tab's screen as usual.
  const toTop = (e: React.MouseEvent, href: string) => {
    if (pathname !== href || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <nav
      aria-label={t("appName")}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg md:static md:w-60 md:shrink-0 md:border-t-0 md:border-r md:px-4 md:py-6"
    >
      <div className="hidden px-3 pb-8 md:block">
        {/* Not "Today": that's the first tab right after it (a11y pass). */}
        <Link href="/app" aria-label={tc("homeAria")} className="inline-block rounded-md">
          <Logo variant="horizontal" width={130} alt="" />
        </Link>
      </div>
      <ul className="grid grid-cols-4 md:flex md:flex-col md:gap-1">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href} className={TAB_ITEM}>
              <Link
                href={tab.href}
                data-testid={tab.id}
                aria-current={active ? "page" : undefined}
                title={t(tab.key)}
                onClick={(e) => toTop(e, tab.href)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl ${TAB_LINK_NARROW} text-xs font-medium md:min-h-12 md:px-3 md:text-left md:flex-row md:justify-start md:gap-3 md:text-base ${
                  active ? "text-accent md:bg-pill" : "text-muted hover:text-text"
                }`}
              >
                <span className="h-6 w-6" aria-hidden="true">
                  {tab.icon}
                </span>
                <span className={TAB_LABEL}>{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg {...iconProps}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
