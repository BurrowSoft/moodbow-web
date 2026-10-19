import { Link } from "@/i18n/navigation";

// Back, on a screen opened from a tab (decision 152): a chevron only, in a
// round ≥ 44 px target; its name ("Back to Timeline") is the aria-label,
// from navBackTo. Never on the four tab screens.
export function BackLink({ href, label, testId }: { href: string; label: string; testId?: string }) {
  return (
    <Link href={href} aria-label={label} data-testid={testId} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-pill">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  );
}

export function ArrowLeft() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
