"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";

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
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav
      aria-label={t("appName")}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg md:static md:w-60 md:shrink-0 md:border-t-0 md:border-r md:px-4 md:py-6"
    >
      <div className="hidden px-3 pb-8 md:block">
        <Link href="/app" aria-label={t("tabToday")} className="inline-block rounded-md">
          <Logo variant="horizontal" width={130} alt="" />
        </Link>
      </div>
      <ul className="grid grid-cols-4 md:flex md:flex-col md:gap-1">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                data-testid={tab.id}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 text-xs font-medium md:min-h-12 md:flex-row md:justify-start md:gap-3 md:text-base ${
                  active ? "text-accent md:bg-pill" : "text-muted hover:text-text"
                }`}
              >
                <span className="h-6 w-6" aria-hidden="true">
                  {tab.icon}
                </span>
                {t(tab.key)}
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
