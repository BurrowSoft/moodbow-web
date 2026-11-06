// A labelled input for the auth forms (sign-in, forgot password, sign-up).
type Props = {
  id: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  hint?: string;
  defaultValue?: string;
  // The id of an error message this field is described by, when shown.
  errorId?: string;
};

export function AuthField({ id, label, type, autoComplete, hint, defaultValue, errorId }: Props) {
  const describedBy = [hint ? `${id}-hint` : null, errorId ?? null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        defaultValue={defaultValue}
        aria-describedby={describedBy}
        aria-invalid={errorId ? true : undefined}
        className="mt-2 block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text outline-none focus-visible:border-accent"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}

// Px sides and a minimum that gives way: at 300 % text, rem sides and a 200 px floor
// pushed this past a 320 px phone (up to 194 px sideways, Web Tester #203).
export const primaryButtonClass =
  "inline-flex min-h-[52px] min-w-[min(200px,100%)] max-w-full items-center justify-center rounded-full bg-accent px-[32px] py-3.5 text-center text-base font-medium text-on-accent [overflow-wrap:anywhere] hover:bg-accent-hover disabled:opacity-60";

export const textLinkClass = "font-medium text-accent underline underline-offset-4";
