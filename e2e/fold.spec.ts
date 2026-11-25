import { expect, test, type Page } from "@playwright/test";
import { foldClass, foldInnerClass } from "../src/lib/ui/fold";

// The entry editor's folding rows (the storybook's board 31b, 25 Nov), with the app's own
// stylesheet: the editor is behind sign-in, so its rows' exact classes (lib/ui/fold) go into a page
// here, between two rows in a 1rem-gap column, as the editor's form is. 250 ms easeOutCubic on the
// size, the fade, the gap and the visibility; folded, nothing is left (no height, its gap given
// back, hidden); with reduced motion no transition at all, so it's instant; inline (Another),
// its width stays, so the prompt's words don't rewrap.
type Seen = { property: string; duration: string; easing: string; opacity: string; visibility: string; height: number; width: number; space: number; words: { width: number; height: number } };

const look = (page: Page, folded: boolean, inline: boolean): Promise<Seen> =>
  page.evaluate(
    ([outer, inner, inline]) => {
      const content = '<a href="#" style="display:inline-flex;align-items:center;min-height:44px">Need a prompt?</a>';
      const tag = inline ? "span" : "div";
      const fold = `<${tag} id="fold" class="${outer}"><${tag} class="${inner}">${content}</${tag}></${tag}>`;
      document.body.innerHTML = inline
        ? `<p id="line" style="display:flex;flex-wrap:wrap;align-items:baseline;column-gap:.75rem;width:300px;margin:0"><span id="words">Who made today a little better?</span>${fold}</p>`
        : `<div style="display:flex;flex-direction:column;gap:1rem;width:300px"><div id="above" style="height:40px"></div>${fold}<div id="below" style="height:40px"></div></div>`;
      const el = document.getElementById("fold")!;
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const above = document.getElementById("above")?.getBoundingClientRect();
      const below = document.getElementById("below")?.getBoundingClientRect();
      const words = document.getElementById("words")?.getBoundingClientRect();
      return {
        property: s.transitionProperty,
        duration: s.transitionDuration,
        easing: s.transitionTimingFunction,
        opacity: s.opacity,
        visibility: s.visibility,
        height: box.height,
        width: box.width,
        space: above && below ? below.top - above.bottom : -1,
        words: { width: words?.width ?? -1, height: words?.height ?? -1 },
      };
    },
    [foldClass(folded, inline), foldInnerClass(folded), inline] as const,
  );

test("a folding row: 250 ms easeOutCubic, folded to nothing (its gap too), instant with reduced motion; inline, the words beside it stay put", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the stylesheet is the same on both; once is enough");
  await page.goto("/");

  const open = await look(page, false, false);
  expect(open.property.split(",").map((p) => p.trim())).toEqual(["grid-template-rows", "opacity", "margin-top", "visibility"]);
  expect(open.duration).toBe("0.25s");
  expect(open.easing).toBe("cubic-bezier(0.33, 1, 0.68, 1)");
  expect(open).toMatchObject({ opacity: "1", visibility: "visible", height: 44 });
  // Two 1rem gaps and the row between the rows above and below it.
  expect(open.space).toBe(16 + 44 + 16);

  const folded = await look(page, true, false);
  expect(folded).toMatchObject({ opacity: "0", visibility: "hidden", height: 0 });
  // One gap left, as if the row weren't there: what's below moves up by all of it.
  expect(folded.space).toBe(16);

  const another = await look(page, false, true);
  const anotherFolded = await look(page, true, true);
  expect(anotherFolded.height).toBe(0);
  expect(anotherFolded.width).toBe(another.width);
  expect(anotherFolded.words).toEqual(another.words);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await look(page, false, false)).property).toBe("none");
  expect((await look(page, true, false)).property).toBe("none");
});
