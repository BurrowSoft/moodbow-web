import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: (p: { href: string; children: React.ReactNode; "aria-label"?: string; className?: string; "data-testid"?: string }) => (
    <a href={p.href} aria-label={p["aria-label"]} className={p.className} data-testid={p["data-testid"]}>
      {p.children}
    </a>
  ),
}));
const { BackLink } = await import("./BackLink");
afterEach(cleanup);

// Back is a chevron only, a round ≥ 44 px target, named by navBackTo (decision 152).
const L = { label: "Back to Timeline" };
describe("BackLink", () => {
  it("no visible text; the name is the label; a 44 px round target", () => {
    render(<BackLink href="/app/timeline" label={L.label} testId="nav-back" />);
    const link = screen.getByRole("link", { name: L.label });
    expect(link).toHaveAttribute("href", "/app/timeline");
    expect(link.textContent).toBe("");
    expect(link.className).toMatch(/\bh-11\b/);
    expect(link.className).toMatch(/\bw-11\b/);
    expect(link.className).toMatch(/\brounded-full\b/);
  });
});
