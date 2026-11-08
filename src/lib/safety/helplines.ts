import { dataLocale } from "@/i18n/routing";
import registry from "../../../content/contracts/countries.json";

// Helpline numbers for the safety card (M8), from the shared country
// registry (content/contracts/countries.json, decision 99). Shown as the
// registry has them, verified or not (UX: TH is still unverified and ships
// as listed). Unknown or no country → the directory link and "your local
// emergency number" only. The helpline's name is in the UI language where
// the registry has one, else English (countries.json names), with its article
// where the language needs one. Hours only for a line that isn't open around
// the clock, the same way. A country may list only its emergency number
// (helpline null: CO).
type Number_ = { display: string; dial: string };
export type Helplines = {
  helpline: (Number_ & { name: string; hours: string | null }) | null;
  emergency: Number_ | null;
  directoryUrl: string;
};

type PerLanguage = { en: string } & Record<string, string | undefined>;
type Country = { code: string; helpline?: { names: PerLanguage; hours?: PerLanguage; display: string; dial: string } | null; emergency?: Number_ };

// A tel: link's number: digits, a leading +, and * or # for a short code
// (Chile's *4141). A # is sent as %23, or Android drops what follows (app #143).
export const telHref = (dial: string) => `tel:${dial.replace(/[^\d+*#]/g, "").replaceAll("#", "%23")}`;

// iOS won't open a tel: link with * or #: there the number is to be dialled by
// hand (safetyDialKeypad). iPadOS says it's a Mac, but has a touch screen.
export const isShortCode = (dial: string) => /[*#]/.test(dial);
export const isIos = (userAgent: string, touchPoints: number) => /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && touchPoints > 1);

// A number stays on one line (HelpNumberText). The longest ones don't fit a 320 px card at 32 px, so
// their line stops growing a size earlier. A journey checks every number on this list.
export const helpLineSize = (display: string) => (display.length >= 12 ? "[font-size:min(1rem,max(8.75vw,28px))]" : "[font-size:min(1rem,max(10vw,32px))]");

export function helplinesFor(country: string | null | undefined, language = "en"): Helplines {
  const directoryUrl = registry.default.directory_url;
  const entry = country ? (registry.countries as Country[]).find((c) => c.code === country.toUpperCase()) : undefined;
  const data = dataLocale(language);
  return {
    helpline: entry?.helpline ? { name: entry.helpline.names[data] ?? entry.helpline.names.en, hours: entry.helpline.hours ? (entry.helpline.hours[data] ?? entry.helpline.hours.en) : null, display: entry.helpline.display, dial: entry.helpline.dial } : null,
    emergency: entry?.emergency ? { display: entry.emergency.display, dial: entry.emergency.dial } : null,
    directoryUrl,
  };
}
