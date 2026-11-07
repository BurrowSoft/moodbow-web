import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A Vercel Preview behind Deployment Protection: one request, from Node, to that host alone, for
// Vercel's cookie. Nothing after that carries the secret. It was a header on every request, which
// reaches every host a page talks to (decision 237). Redirects aren't followed, so it can't reach
// another host from here either. Never print the secret.
export const BYPASS_STATE = join(tmpdir(), "moodbow-e2e-preview-cookie.json");

export function usesPreviewBypass(baseUrl: string, secret: string | undefined): boolean {
  if (!secret) return false;
  const url = new URL(baseUrl);
  return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
}

const SAME_SITE = { strict: "Strict", lax: "Lax", none: "None" } as const;

// One Set-Cookie line, as Playwright's storage state wants it.
function cookieFrom(line: string, domain: string) {
  const [pair, ...attributes] = line.split(";").map((part) => part.trim());
  const at = pair.indexOf("=");
  const attribute = (name: string) => attributes.find((a) => a.toLowerCase().startsWith(`${name}=`))?.slice(name.length + 1);
  const has = (name: string) => attributes.some((a) => a.toLowerCase() === name);
  const maxAge = Number(attribute("max-age"));
  const sameSite = (attribute("samesite") ?? "lax").toLowerCase() as keyof typeof SAME_SITE;
  return {
    name: pair.slice(0, at),
    value: pair.slice(at + 1),
    domain,
    path: attribute("path") ?? "/",
    expires: Number.isFinite(maxAge) && maxAge > 0 ? Math.floor(Date.now() / 1000) + maxAge : -1,
    httpOnly: has("httponly"),
    secure: has("secure"),
    sameSite: SAME_SITE[sameSite] ?? "Lax",
  };
}

export async function previewBypassState(baseUrl: string, secret: string, fetcher: typeof fetch = fetch) {
  if (!usesPreviewBypass(baseUrl, secret)) throw new Error("The bypass is for a https *.vercel.app Preview only");
  const { origin, hostname } = new URL(baseUrl);
  const response = await fetcher(`${origin}/`, {
    redirect: "manual",
    headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
  });
  const cookies = response.headers.getSetCookie().map((line) => cookieFrom(line, hostname));
  if (cookies.length === 0) throw new Error(`No bypass cookie from the Preview (HTTP ${response.status})`);
  return { cookies, origins: [] };
}

// Playwright's globalSetup, only when usesPreviewBypass says so. The file is gone when the run ends.
export default async function globalSetup() {
  const state = await previewBypassState(process.env.E2E_BASE_URL ?? "", process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "");
  writeFileSync(BYPASS_STATE, JSON.stringify(state), { mode: 0o600 });
  return () => rmSync(BYPASS_STATE, { force: true });
}
