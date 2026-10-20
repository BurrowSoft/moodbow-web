import registry from "../../../content/contracts/countries.json";

// Helpline numbers for the safety card (M8), from the shared country
// registry (content/contracts/countries.json, decision 99). Shown as the
// registry has them, verified or not (UX: TH is still unverified and ships
// as listed). Unknown or no country → the directory link and "your local
// emergency number" only. The helpline's name is in the UI language where
// the registry has one, else English (countries.json names {en, th?}).
type Number_ = { display: string; dial: string };
export type Helplines = {
  helpline: (Number_ & { name: string }) | null;
  emergency: Number_ | null;
  directoryUrl: string;
};

type Country = { code: string; helpline?: { names: { en: string } & Record<string, string | undefined>; display: string; dial: string }; emergency?: Number_ };

// A tel: link's number: digits and a leading + only.
export const telHref = (dial: string) => `tel:${dial.replace(/[^\d+]/g, "")}`;

export function helplinesFor(country: string | null | undefined, language = "en"): Helplines {
  const directoryUrl = registry.default.directory_url;
  const entry = country ? (registry.countries as Country[]).find((c) => c.code === country.toUpperCase()) : undefined;
  return {
    helpline: entry?.helpline ? { name: entry.helpline.names[language] ?? entry.helpline.names.en, display: entry.helpline.display, dial: entry.helpline.dial } : null,
    emergency: entry?.emergency ? { display: entry.emergency.display, dial: entry.emergency.dial } : null,
    directoryUrl,
  };
}
