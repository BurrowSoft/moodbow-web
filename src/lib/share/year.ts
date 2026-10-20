import { MIN_CHECK_INS, MOOD_HEX, THEMES, type CardTheme, type MonthCheckIn } from "./moodbow";

// "My year's moodbow" (1.1 J, decision 184, m10-share-card.md): twelve
// bands, January innermost, each the month's most frequent mood (ties → the
// higher) in its Sunrise colour; a month with fewer than 5 check-ins is a
// faint neutral band (the theme's muted colour at 25% opacity).
export const YEAR_MIN_MONTHS = 3;
const FAINT_ALPHA = "40"; // 25% as the last two digits of #RRGGBBAA

export type YearCard = { colours: string[]; colouredMonths: number; days: number };

export function yearBands(rows: MonthCheckIn[], year: number, theme: CardTheme): YearCard {
  const prefix = `${year}-`;
  const counts = Array.from({ length: 12 }, () => [0, 0, 0, 0, 0]);
  let days = 0;
  for (const r of rows) {
    if (!r.local_date.startsWith(prefix) || r.mood < 1 || r.mood > 5) continue;
    const month = Number(r.local_date.slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    counts[month][r.mood - 1]++;
    days++;
  }
  let colouredMonths = 0;
  const colours = counts.map((byMood) => {
    const total = byMood.reduce((a, b) => a + b, 0);
    if (total < MIN_CHECK_INS) return `${THEMES[theme].muted}${FAINT_ALPHA}`;
    colouredMonths++;
    // The most frequent mood; on a tie the higher one wins.
    let best = 0;
    for (let m = 1; m < 5; m++) if (byMood[m] >= byMood[best]) best = m;
    return MOOD_HEX[best];
  });
  return { colours, colouredMonths, days };
}

// Which year's card is on offer for the profile's today: December → this
// year, January → last year, otherwise none.
export function yearOnOffer(today: string): number | null {
  const [y, m] = today.split("-").map(Number);
  if (m === 12) return y;
  if (m === 1) return y - 1;
  return null;
}

export const yearFileName = (year: number) => `moodbow-${year}.png`;
export const yearRange = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` });
