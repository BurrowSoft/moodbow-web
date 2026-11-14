"use client";

import { useActionState, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthField, primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { FocusOnMount } from "@/components/FocusOnMount";
import { signUpFlow, type SignUpState } from "./actions";

const ERROR_KEYS = {
  emailInvalid: ["auth", "errEmailInvalid"],
  passwordShort: ["onboarding", "errPasswordShort"],
  // The browser keeps Create account off until the boxes are ticked; this is for the rest (no JS).
  consentRequired: ["onboarding", "errConsentRequired"],
  ageRequired: ["onboarding", "errAgeRequired"],
  emailTaken: ["onboarding", "errEmailTaken"],
  // Too many tries: the same words as Send it again's notice (UX).
  rateLimited: ["auth", "errRateLimited"],
  generic: ["auth", "errGeneric"],
} as const;

// The browser's IANA time zone, for the profile's "today" (never UTC dates).
const subscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
const noTimeZoneOnServer = () => "";
const hydratedNow = () => true;
const notHydrated = () => false;

// One consent box: its own, unticked, required (the action checks again).
function Box({ name, label, checked, onChange, testId, describedBy, invalid }: { name: string; label: string; checked: boolean; onChange: (v: boolean) => void; testId: string; describedBy?: string; invalid?: boolean }) {
  return (
    <label className="flex items-start gap-[12px] rounded-2xl border border-border bg-surface p-[16px] text-text">
      <input
        type="checkbox"
        name={name}
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        className="mt-[4px] h-[20px] w-[20px] shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

// Create account → Check email, on one page. The password typed here stays
// in this component's memory only, so "I've confirmed my email" can sign in
// without asking again (decision: web-only button). Nothing is stored.
// The consents are here too (1.3 §6; the Reviewer's rulings): what Moodbow is, in the welcome's
// three lines, above the boxes; Terms and Privacy, health data, and 18+, each its own unticked box
// with its link (opened in a new tab, so what's typed stays); AI only where it's asked, optional.
// Create account stays off until the required boxes are ticked, once the page runs.
export function SignUpForm({ askAi = false, healthLink = false }: { askAi?: boolean; healthLink?: boolean }) {
  const t = useTranslations("onboarding");
  const ta = useTranslations("auth");
  const tai = useTranslations("ai");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [privacy, setPrivacy] = useState(false);
  const [health, setHealth] = useState(false);
  const [age, setAge] = useState(false);
  const hydrated = useSyncExternalStore(subscribe, hydratedNow, notHydrated);
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpFlow, { status: "idle" });
  const [password, setPassword] = useState("");
  // Typed before the page's code ran: taken into state here, or the next render
  // would empty the field. It stays in this component, as ever.
  const passwordField = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const typed = passwordField.current?.value;
    if (typed) setPassword(typed);
  }, []);
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, noTimeZoneOnServer);
  // "Sent again" twice in a row is the same text: empty the region on each
  // resend, so the next answer is announced again (reviewer #39). A new
  // answer (a new state object) shows it again.
  const [resending, setResending] = useState(false);
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    setResending(false);
  }

  if (state.status === "checkEmail") {
    const NOTICES = {
      resent: "checkEmailResent",
      notConfirmed: "errEmailNotConfirmed",
      rateLimited: "errRateLimited",
      generic: "errGeneric",
    } as const;
    const notice = state.notice ? ta(NOTICES[state.notice]) : null;
    return (
      <div className="space-y-6" data-testid="check-email">
        <FocusOnMount className="text-2xl font-medium text-text">{t("checkEmailTitle")}</FocusOnMount>
        <p>{t("checkEmailBody", { email: state.email })}</p>
        {/* "Sent again" goes in a region that's always there (so it's
            announced); a problem is an alert. */}
        <p role="status" className="font-medium text-text empty:hidden" data-testid={state.notice === "resent" ? "check-email-notice" : undefined}>
          {state.notice === "resent" && !resending ? notice : null}
        </p>
        {notice && state.notice !== "resent" && (
          <p role="alert" data-testid="check-email-notice" className="font-medium text-text">
            {notice}
          </p>
        )}
        <form action={action}>
          <input type="hidden" name="intent" value="confirmed" />
          <input type="hidden" name="password" value={password} />
          <button type="submit" disabled={pending} data-testid="check-email-confirmed" className={primaryButtonClass}>
            {t("checkEmailConfirmed")}
          </button>
        </form>
        <form action={action} onSubmit={() => setResending(true)}>
          <input type="hidden" name="intent" value="resend" />
          <button type="submit" disabled={pending} data-testid="check-email-resend" className={textLinkClass}>
            {t("checkEmailResend")}
          </button>
        </form>
      </div>
    );
  }

  const error = state.status === "error" ? state.error : null;
  const message = error ? (ERROR_KEYS[error][0] === "auth" ? ta(ERROR_KEYS[error][1]) : t(ERROR_KEYS[error][1])) : null;
  // The error is tied to the field it's about (aria-invalid + described by).
  const errorOn = error === "passwordShort" ? "password" : error === "ageRequired" ? "age" : error === "consentRequired" ? "consent" : error === "emailInvalid" || error === "emailTaken" ? "email" : null;
  const smallText = "leading-[1.429] [font-size:min(0.875rem,max(8.75vw,28px))]";
  return (
    <div className="space-y-6">
      <ul data-testid="signup-summary" className="list-disc space-y-1 ps-5 text-muted">
        <li>{t("welcome1Body")}</li>
        <li>{t("welcome2Body")}</li>
        <li>{t("welcome3BodyNoAi")}</li>
      </ul>
      <form action={action} noValidate className="space-y-5 max-sm:[font-size:min(1rem,max(10vw,32px))]">
        <input type="hidden" name="intent" value="signup" />
        <input type="hidden" name="time_zone" value={timeZone} />
        <AuthField
          id="email"
          label={ta("emailLabel")}
          type="email"
          autoComplete="email"
          defaultValue={state.status === "error" ? state.email : undefined}
          errorId={errorOn === "email" ? "signup-error" : undefined}
        />
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text">
            {ta("passwordLabel")}
          </label>
          <input
            ref={passwordField}
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={errorOn === "password" ? "password-hint signup-error" : "password-hint"}
            aria-invalid={errorOn === "password" ? true : undefined}
            className="mt-2 block w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text outline-none focus-visible:border-accent"
          />
          <p id="password-hint" className="mt-1 text-sm">
            {t("passwordHint")}
          </p>
        </div>
        <Box name="privacy" testId="consent-privacy" label={t("consentPrivacy")} checked={privacy} onChange={setPrivacy} describedBy={errorOn === "consent" ? "signup-error" : undefined} invalid={errorOn === "consent" && !privacy} />
        <p className={`flex flex-wrap gap-x-[24px] gap-y-[4px] px-[4px] ${smallText}`}>
          <Link href="/terms" target="_blank" rel="noopener" data-testid="consent-read-terms" className={textLinkClass}>
            {t("consentReadTerms")} <span className="sr-only">{tc("opensInNewTab")}</span>
          </Link>
          <Link href="/privacy" target="_blank" rel="noopener" data-testid="consent-read-privacy" className={textLinkClass}>
            {t("consentReadPrivacy")} <span className="sr-only">{tc("opensInNewTab")}</span>
          </Link>
        </p>
        {locale !== "en" && (
          <p data-testid="consent-legal-english" className={`px-[4px] text-muted ${smallText}`}>
            {t("consentLegalEnglish")}
          </p>
        )}
        <Box name="health" testId="consent-health" label={t("consentHealth")} checked={health} onChange={setHealth} describedBy={errorOn === "consent" ? "signup-error" : undefined} invalid={errorOn === "consent" && !health} />
        {healthLink && (
          <p className={`px-[4px] ${smallText}`}>
            <Link href="/consumer-health-data" target="_blank" rel="noopener" data-testid="consent-read-health" className={textLinkClass}>
              {tc("consumerHealthData")} <span className="sr-only">{tc("opensInNewTab")}</span>
            </Link>
          </p>
        )}
        <Box name="age" testId="consent-age" label={t("ageConfirm")} checked={age} onChange={setAge} describedBy={errorOn === "age" ? "signup-error" : undefined} invalid={errorOn === "age"} />
        {askAi && (
          <label className="flex items-start gap-[12px] rounded-2xl border border-border bg-surface p-[16px] text-text">
            <input type="checkbox" name="ai" data-testid="consent-ai" aria-describedby="consent-ai-body" className="mt-[4px] h-[20px] w-[20px] shrink-0 accent-[var(--accent)]" />
            <span className="flex min-w-0 flex-col gap-[4px]">
              <span className="font-medium">{tai("consentAiTitle")}</span>
              <span id="consent-ai-body" aria-hidden="true" className={`text-muted ${smallText}`}>
                {tai("consentAiBody")}
              </span>
            </span>
          </label>
        )}
        {message && (
          <p id="signup-error" role="alert" data-testid="signup-error" className="font-medium text-accent">
            {message}
          </p>
        )}
        <button type="submit" disabled={pending || (hydrated && !(privacy && health && age))} data-testid="signup-submit" className={primaryButtonClass}>
          {t("signupSubmit")}
        </button>
      </form>
      <p>
        <Link href="/sign-in" data-testid="signup-to-signin" className={textLinkClass}>
          {t("signupHaveAccount")}
        </Link>
      </p>
    </div>
  );
}
