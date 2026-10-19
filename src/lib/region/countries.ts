// Every ISO 3166-1 alpha-2 country, for Me → Country (decision 99: the
// picker lists them all; countries outside the helpline registry get the
// safety card's default). Names come from the browser (Intl.DisplayNames)
// in the UI language.
export const ISO_COUNTRIES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS " +
  "MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS " +
  "RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW " +
  "TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

export const isCountry = (v: unknown): v is string => typeof v === "string" && ISO_COUNTRIES.includes(v);

// The countries as [code, name], sorted by name in the UI language.
export function countryOptions(locale: string): [string, string][] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  return ISO_COUNTRIES.map((code): [string, string] => [code, names?.of(code) ?? code]).sort((a, b) => a[1].localeCompare(b[1], locale));
}

// IANA time zones the browser/server knows (the database checks the name
// again against pg_timezone_names). The profile's own zone is always
// offered, even if this runtime doesn't list it.
export function timeZoneOptions(current: string | null | undefined): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

export const isTimeZoneName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(v) && v.length <= 64;

// The web's languages as [code, name], each named in its own language.
export function languageOptions(locales: readonly string[]): [string, string][] {
  return locales.map((code): [string, string] => {
    try {
      return [code, new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code];
    } catch {
      return [code, code];
    }
  });
}
