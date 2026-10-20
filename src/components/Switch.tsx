// An on/off switch row, as the app's SwitchListTile (decision 206): the whole
// row is the control (a big target), its name is the label, and an optional
// hint is its description. While a save runs it's aria-disabled, not
// disabled, so focus stays on it; a click then does nothing.
export function Switch({
  checked,
  onChange,
  label,
  hint,
  hintId,
  testId,
  busy = false,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  hintId?: string;
  testId: string;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={busy || undefined}
        aria-describedby={hint && hintId ? hintId : undefined}
        data-testid={testId}
        onClick={() => {
          if (!busy) onChange(!checked);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left font-medium text-text aria-disabled:opacity-60"
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border transition-colors ${checked ? "bg-accent" : "bg-pill"}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
        </span>
      </button>
      {hint && hintId && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
