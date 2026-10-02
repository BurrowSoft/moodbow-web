import { Link } from "@/i18n/navigation";

// A back control: a visible arrow (decorative) plus the "Back" text from
// messages, so the label is what screen readers announce too.
export function BackLink({ href, label, testId }: { href: string; label: string; testId?: string }) {
  return (
    <Link href={href} data-testid={testId} className="inline-flex min-h-12 items-center gap-2 font-medium text-accent underline-offset-4 hover:underline">
      <ArrowLeft />
      {label}
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
