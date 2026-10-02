// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

// Self-test for the project's guard rules (eslint.config.mjs), so a config
// change can't silently switch them off.
const eslint = new ESLint({ cwd: process.cwd() });
// Loading the full config takes a few seconds on the first run, and much
// longer when the whole suite runs in parallel on a busy machine.
const SLOW = { timeout: 120_000 };

async function ruleHits(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}:${m.line}`);
}

describe("Sentry setters are banned (decision 49)", SLOW, () => {
  it("flags Sentry.setUser / setTag / setContext / setExtra and scope.setUser in .ts and .tsx", async () => {
    const code = [
      'import * as Sentry from "@sentry/nextjs";',
      'Sentry.setUser({ id: "x" });',
      'Sentry.setTag("k", "v");',
      'Sentry.setContext("c", {});',
      'Sentry.setExtra("e", 1);',
      "Sentry.withScope((scope) => scope.setUser(null));",
      "",
    ].join("\n");
    for (const file of ["src/__probe__.ts", "src/__probe__.tsx"]) {
      const hits = (await ruleHits(code, file)).filter((h) => h.startsWith("no-restricted-syntax"));
      expect(hits, file).toEqual([2, 3, 4, 5, 6].map((l) => `no-restricted-syntax:${l}`));
    }
  });

  it("flags named imports of the setters", async () => {
    const hits = await ruleHits('import { setUser } from "@sentry/nextjs";\nexport const x = setUser;\n', "src/__probe__.ts");
    expect(hits).toContain("no-restricted-syntax:1");
  });
});

describe("no hard-coded user-facing text (decision 32)", SLOW, () => {
  it("flags JSX text and literal user-facing attributes, allows structural props", async () => {
    const code = [
      "export function P({ x }: { x: string }) {",
      "  return (",
      '    <div className="ok" data-testid="ok">',
      "      Hello world",
      '      <img src="/a.png" alt="A logo" />',
      '      <button aria-label={"Close"}>{x}</button>',
      '      <span aria-hidden="true">·</span>',
      '      <img src="/b.png" alt="" />',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const hits = await ruleHits(code, "src/__probe__.tsx");
    expect(hits).toEqual(["react/jsx-no-literals:3", "no-restricted-syntax:5", "no-restricted-syntax:6"]);
  });
});
