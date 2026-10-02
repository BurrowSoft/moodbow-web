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
// - draft: not met, on a build that is explicitly a test build, so testers
//   can review it; shown with a "draft" banner and noindex.
// - hidden: not met anywhere else; the route is a 404.
// Fails closed: only a known test build shows drafts. That means a Vercel
// Preview or development deployment (Vercel sets NEXT_PUBLIC_VERCEL_ENV at
// build time), `next dev` (NODE_ENV=development), or a build made with
// NEXT_PUBLIC_SHOW_DRAFTS=1 (the CI e2e job). An unset or unknown
// environment hides the page.
export type PageGate = "live" | "draft" | "hidden";

export type BuildEnv = { vercelEnv?: string; nodeEnv?: string; showDrafts?: string };

const currentBuild: BuildEnv = {
  vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
  showDrafts: process.env.NEXT_PUBLIC_SHOW_DRAFTS,
};

export function draftsAllowed({ vercelEnv, nodeEnv, showDrafts }: BuildEnv = currentBuild): boolean {
  if (vercelEnv === "production") return false;
  return vercelEnv === "preview" || vercelEnv === "development" || nodeEnv === "development" || showDrafts === "1";
}

export function pageGate(id: ConditionId, build: BuildEnv = currentBuild): PageGate {
  if (conditionMet(id)) return "live";
  return draftsAllowed(build) ? "draft" : "hidden";
}
