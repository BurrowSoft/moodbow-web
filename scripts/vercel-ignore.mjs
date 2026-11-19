// Vercel's Ignored Build Step (vercel.json "ignoreCommand"): exit 1 builds, exit 0 skips, by Vercel's convention
// (https://vercel.com/docs/project-configuration/vercel-json#ignorecommand). Build CPU was most of November's bill
// (UX, 20 Nov): every push to every branch built a Preview, even a push that only changed tests or docs.
//   - Always build: Production, and the branches master, preview/* and test/plus-walk (the testers' fixed Previews).
//   - Otherwise build only if something that ships changed since the branch's last successful deployment
//     (VERCEL_GIT_PREVIOUS_SHA: Vercel sets it only when this step exists, empty on a branch's first deployment; then
//     the commit's parent).
//   - Anything unclear builds: no base to compare with, git failing (a shallow clone), nothing changed at all (a
//     redeploy of the same commit is never cancelled).
// One line in the build log says why. Runs in the project root, before the install, with plain node.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// What a deployment is made of: the app's source and content, its public files and fonts (assets/ is read at run time
// by the OG image), and the build's own config.
export const BUILD_PATHS =
  /^(src\/|content\/|public\/|assets\/|package\.json$|package-lock\.json$|next\.config\.|postcss\.config\.|tailwind\.config\.|tsconfig\.json$|vercel\.json$|eslint\.config\.|next-env\.d\.ts$|middleware\.|instrumentation\.|\.npmrc$|\.nvmrc$|\.node-version$)/;
// Tests never ship, even inside src/.
export const TEST_FILES = /\.(test|spec)\.[cm]?[jt]sx?$/;
export const alwaysBuilds = (ref) => ref === "master" || ref.startsWith("preview/") || ref === "test/plus-walk";

// files: what changed since the last deployment, or null when there was nothing to compare with.
export function decide({ env, ref, files }) {
  if (env === "production") return { build: true, why: "production" };
  if (alwaysBuilds(ref ?? "")) return { build: true, why: `branch ${ref} always builds` };
  if (!files) return { build: true, why: "nothing to compare with" };
  if (!files.length) return { build: true, why: "no changed files to judge (a redeploy builds)" };
  const shipping = files.filter((f) => BUILD_PATHS.test(f) && !TEST_FILES.test(f));
  return shipping.length
    ? { build: true, why: `${shipping.length} shipping file(s) changed, e.g. ${shipping[0]}` }
    : { build: false, why: `only tests, docs or tooling changed (${files.length} file(s), e.g. ${files[0]})` };
}

function changedFiles() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  let base = process.env.VERCEL_GIT_PREVIOUS_SHA ?? "";
  if (base) {
    try {
      git("cat-file", "-e", `${base}^{commit}`);
    } catch {
      base = ""; // not in this clone
    }
  }
  if (!base) {
    try {
      base = git("rev-parse", "--verify", "-q", "HEAD^");
    } catch {
      return { files: null, against: "" };
    }
  }
  try {
    return { files: git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean), against: base.slice(0, 8) };
  } catch {
    return { files: null, against: base.slice(0, 8) };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env.VERCEL_ENV ?? "";
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "";
  const quick = env === "production" || alwaysBuilds(ref);
  const { files, against } = quick ? { files: [], against: "" } : changedFiles();
  const d = decide({ env, ref, files });
  console.log(`vercel-ignore: ${d.build ? "BUILD" : "SKIP"} (${d.why}${against ? `; against ${against}` : ""})`);
  process.exit(d.build ? 1 : 0);
}
