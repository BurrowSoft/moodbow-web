import conditions from "../../content/conditions.json";

// The "is it true yet?" registry (content/conditions.json). Pages that make
// a claim (legal text, account deletion steps, backup retention) read the
// same flags, so text never goes live before the system enforces it.
// Flipping one to met: true is its own small reviewed PR.
export type ConditionId = keyof typeof conditions;

export function conditionMet(id: ConditionId): boolean {
  return conditions[id].met === true;
}

// How a page that depends on a condition is served:
// - live: the condition is met; public, indexed, linked.
// - draft: not met, outside Production (Preview, local, CI), so testers
//   can review it; shown with a "draft" banner and noindex.
// - hidden: not met, on Production; the route is a 404.
// Vercel sets NEXT_PUBLIC_VERCEL_ENV (production / preview / development)
// at build time.
export type PageGate = "live" | "draft" | "hidden";

export function pageGate(id: ConditionId, vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV): PageGate {
  if (conditionMet(id)) return "live";
  return vercelEnv === "production" ? "hidden" : "draft";
}
