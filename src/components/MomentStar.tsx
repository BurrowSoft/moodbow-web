// The ★ on an entry preview marked as a moment. An icon with no visible
// text, so its accessible name is the momentBadge key ("Moment", UX); same
// on the app.
export function MomentStar({ label }: { label: string }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-accent" data-testid="moment-star">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
  );
}
