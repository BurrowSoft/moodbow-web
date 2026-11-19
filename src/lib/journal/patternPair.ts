// Board 3's header and row labels per pattern (UX, 14 Nov): insights message keys, shared by
// Patterns (Insights) and More patterns (Plus).
export const PATTERN_PAIR = {
  sleep: { title: "chartSleep", a: "pairSleepMore", b: "pairSleepLess" },
  movement: { title: "chartExercise", a: "pairMoved", b: "pairNotMoved" },
  stress: { title: "chartStress", a: "pairStressLow", b: "pairStressHigh" },
  weekdays: { title: "pairWeekTitle", a: "pairWeekdays", b: "pairWeekends" },
  writing: { title: "pairWritingTitle", a: "pairWrote", b: "pairNotWrote" },
} as const;
