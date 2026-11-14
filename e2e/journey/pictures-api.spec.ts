import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { addPicture, cleanup, configured, confirmEmail, grantPlusTrial, journalToday, newEmail, newPassword, notConfigured, picturesOnStaging, seedMoment, signedUpUnconfirmed, storageStatus, userSession } from "./staging";

// Pictures (035/036) at the Storage API itself, against staging (UX and the Reviewer, 14 Nov, after
// the Web Tester's A12): Storage lets an object's uploader read it whatever its row says, so the web
// removes a picture's files under the person's own session BEFORE the row goes (× and entry delete).
// Each step's HTTP codes (fresh sign + authenticated GET, with the publishable key and that user's
// own JWT) go to the log. Asserted: B never reaches A's file (live or deleted); A can't after × or an
// entry delete done through the web. Logged only (the control): the old order, the row deleted with
// no remove first, which shows the uploader shortcut on this Storage version.
test.skip(!configured, notConfigured);

const refused = (s: { sign: number; get: number }) => s.sign >= 400 && s.get >= 400;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("main form button[type=submit]").first().click();
  await expect(page).toHaveURL(RegExp("/app$"), { timeout: 20_000 });
}

test("pictures at the Storage API: B never; A not after × or an entry delete; the RPC-only order logged as the control", async ({ page }) => {
  test.skip(!(await picturesOnStaging()), "staging doesn't have 035 yet");
  test.setTimeout(180_000);
  const a = newEmail();
  const b = newEmail();
  const pa = newPassword();
  const pb = newPassword();
  const log: string[] = [];
  const note = (step: string, s: { sign: number; get: number }) => log.push(`${step}: sign ${s.sign}, get ${s.get}`);
  try {
    for (const [email, password] of [[a, pa], [b, pb]] as const) {
      await signedUpUnconfirmed(email, password);
      await confirmEmail(email);
    }
    await grantPlusTrial(a);
    const jpeg = new Uint8Array(await readFile(path.join(process.cwd(), "src/lib/journal/__fixtures__/chromium-canvas.jpg")));
    const A = await userSession(a, pa);
    const B = await userSession(b, pb);
    const today = await journalToday(a, pa);
    const moment = await seedMoment(a, pa, today, "A by the sea.");

    // 1. A live picture: A reaches it; B doesn't.
    const p1 = await addPicture(A, moment, jpeg);
    const a1 = await storageStatus(A.token, p1.path);
    note("A, live", a1);
    expect(a1.sign, "A signs their live picture").toBe(200);
    const b1 = await storageStatus(B.token, p1.path);
    note("B, A's live", b1);
    expect(refused(b1), "B can't reach A's live picture").toBe(true);

    // 2. × through the web: the files go first, then the row; A can't reach them any more, nor B.
    await signIn(page, a, pa);
    await page.goto(`/app/entries/${moment}`);
    await expect(page.getByTestId("entry-picture")).toHaveCount(1, { timeout: 15_000 });
    await page.getByTestId("entry-picture-remove").click();
    await expect(page.getByTestId("entry-picture")).toHaveCount(0, { timeout: 15_000 });
    const a2 = await storageStatus(A.token, p1.path);
    note("A, after × (web)", a2);
    expect(refused(a2), "A can't reach a picture removed with ×").toBe(true);
    const a2t = await storageStatus(A.token, p1.thumb);
    note("A, thumbnail after × (web)", a2t);
    expect(refused(a2t), "nor its thumbnail").toBe(true);
    const b2 = await storageStatus(B.token, p1.path);
    note("B, A's deleted", b2);
    expect(refused(b2), "B can't reach A's deleted picture").toBe(true);

    // 3. The control: the row deleted with no remove first (the old order). Logged, not asserted.
    const p2 = await addPicture(A, moment, jpeg);
    const { error: rpcError } = await A.client.rpc("picture_delete", { p_id: p2.id });
    expect(rpcError).toBeNull();
    note("A, control: picture_delete only (no remove)", await storageStatus(A.token, p2.path));
    note("B, control: A's row deleted, file left", await storageStatus(B.token, p2.path));

    // 4. Deleting the entry through the web: its pictures' files go first; A can't reach them.
    const moment2 = await seedMoment(a, pa, today, "A at the market.");
    const p3 = await addPicture(A, moment2, jpeg);
    await page.goto(`/app/entries/${moment2}`);
    await page.getByTestId("entry-more").click();
    await page.getByTestId("entry-menu-delete").click();
    await page.getByTestId("entry-delete-confirm").click();
    await expect(page).not.toHaveURL(RegExp(moment2), { timeout: 20_000 });
    const a4 = await storageStatus(A.token, p3.path);
    note("A, after an entry delete (web)", a4);
    expect(refused(a4), "A can't reach a deleted entry's picture").toBe(true);
  } finally {
    console.log(`[pictures-api] ${log.join(" | ")}`);
    await cleanup(a);
    await cleanup(b);
  }
});
