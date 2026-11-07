import fs from "node:fs";
import path from "node:path";
import { renderLegal, type LegalPage } from "@/lib/legalContent";

// The public page a security notice points to (specs/breach-procedure-draft.md). It exists only
// while a file does, in content/security: on a normal day it's a 404, and nothing links to it.
const SECURITY_DIR = path.join(process.cwd(), "content", "security");

export function hasSecurityUpdate(dir = SECURITY_DIR): boolean {
  return fs.existsSync(path.join(dir, "en.md"));
}

export function securityUpdate(locale: string, dir = SECURITY_DIR): (LegalPage & { english: boolean }) | null {
  if (!hasSecurityUpdate(dir)) return null;
  const own = path.join(dir, `${locale}.md`);
  const english = !fs.existsSync(own);
  return { ...renderLegal(fs.readFileSync(english ? path.join(dir, "en.md") : own, "utf8").replace(/\r\n/g, "\n")), english };
}
