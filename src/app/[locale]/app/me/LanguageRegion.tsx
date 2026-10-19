"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { saveRegion, type AiSaveResult, type RegionField } from "./actions";

type Values = Record<RegionField, string>;

// Me → Language & region (M7, r1 §M7): language, country, time zone. Each
// saves as soon as it changes; a failed save puts it back to what the
// account has, with the error and Try again (decision 111). Country drives
// the safety card's numbers (decision 99: every ISO country; "Not set" =
// the default card); the time zone decides what "today" is, so the page
// refreshes after it changes.
// The lists come from the server (built once there): the browser's own
// Intl names, sort order and zone list can differ (Safari), which would
// make the <option>s differ from the server HTML (reviewer #36).
export function LanguageRegion({ initial, countries, zones, languages }: { initial: Values; countries: [string, string][]; zones: string[]; languages: [string, string][] }) {
  const t = useTranslations("me");
  const ta = useTranslations("app");
  const tt = useTranslations("today");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState(initial);
  const saved = useRef(initial);
  const [failed, setFailed] = useState<{ field: RegionField; tried: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (field: RegionField, next: string) => {
    setFailed(null);
    setValues((v) => ({ ...v, [field]: next }));
    startTransition(async () => {
      let result: AiSaveResult;
      try {
        result = await saveRegion(field, next);
      } catch (e) {
        if (typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw e;
        result = { ok: false };
      }
      if (!result.ok) {
        setValues((v) => ({ ...v, [field]: saved.current[field] }));
        setFailed({ field, tried: next });
        return;
      }
      saved.current = { ...saved.current, [field]: next };
      if (field === "locale" && next !== locale) router.replace(pathname, { locale: next });
      else if (field === "time_zone") router.refresh();
    });
  };

  const select = "mt-2 block w-full rounded-2xl border border-border bg-bg px-4 py-3 text-text disabled:opacity-50";

  return (
    <section aria-labelledby="me-region" className="rounded-3xl border border-border bg-surface p-6" aria-busy={pending}>
      <h2 id="me-region" className="text-lg font-medium text-text">
        {t("meLanguageRegion")}
      </h2>

      <label htmlFor="me-language" className="mt-4 block text-sm font-medium text-text">
        {t("meLanguage")}
      </label>
      <select id="me-language" data-testid="me-language" className={select} value={values.locale} disabled={pending || languages.length < 2} onChange={(e) => save("locale", e.target.value)}>
        {languages.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>

      <label htmlFor="me-country" className="mt-4 block text-sm font-medium text-text">
        {t("meCountry")}
      </label>
      <select id="me-country" data-testid="me-country" className={select} value={values.country} disabled={pending} onChange={(e) => save("country", e.target.value)}>
        <option value="">{t("meCountryNone")}</option>
        {countries.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>

      <label htmlFor="me-time-zone" className="mt-4 block text-sm font-medium text-text">
        {t("meTimeZone")}
      </label>
      <select id="me-time-zone" data-testid="me-time-zone" className={select} value={values.time_zone} disabled={pending} onChange={(e) => save("time_zone", e.target.value)}>
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      {failed && !pending && (
        <div className="mt-4">
          <p role="alert" data-testid="me-region-error" className="text-sm font-medium text-accent">
            {tt("errGeneric")}
          </p>
          <button type="button" data-testid="me-region-retry" onClick={() => save(failed.field, failed.tried)} className="mt-2 min-h-11 rounded-full border border-border px-4 text-sm font-medium text-text">
            {ta("tryAgain")}
          </button>
        </div>
      )}
    </section>
  );
}
