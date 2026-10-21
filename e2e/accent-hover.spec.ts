import { expect, test, type Page } from "@playwright/test";

// An accent button's hover keeps its text ≥ 4.5:1 in both themes
// (colour-roles; the Web Tester's 1.0 pass found 3.91:1 light / 4.33:1 dark
// with the old opacity-90 hover). Every accent button shares the one
// hover token (--accent-hover); the landing page's call to action stands in.
// Tailwind's hover: only applies where the device can hover, so not on the
// touch (mobile) project.
test.skip(({ isMobile }) => isMobile, "no hover on a touch device");

// "rgb(r, g, b)" or "color(srgb r g b)" (what a color-mix() computes to) → 0–255.
function channels(css: string): [number, number, number] {
  const nums = (css.match(/[\d.]+/g) ?? []).map(Number);
  if (css.startsWith("color(")) return [nums[0] * 255, nums[1] * 255, nums[2] * 255];
  return [nums[0], nums[1], nums[2]];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(channels(a)), luminance(channels(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function hoveredColours(page: Page) {
  const cta = page.locator('[data-testid="home-start"], [data-testid="home-notify"]').first();
  const read = () =>
    cta.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, fg: s.color, opacity: s.opacity };
    });
  const before = await read();
  await cta.hover();
  // The hover really applied (else this would only check the resting colours).
  await expect.poll(async () => (await read()).bg).not.toBe(before.bg);
  return read();
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: a hovered accent button stays ≥ 4.5:1`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem("mb:theme", t), theme);
    await page.goto("/");
    const { bg, fg, opacity } = await hoveredColours(page);
    expect(opacity).toBe("1");
    expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });
}
