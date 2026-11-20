import { getMessages } from "next-intl/server";
import { savedLanguageCopy, type SavedLanguageCopy } from "./savedLanguageCopy";

// The gate's copy for a page whose address is in `here` while the person's saved language is `target` (#401): the
// move's words from the saved language's own messages, the stay and close from this page's. Server only.
export async function languageGateCopy(target: string, here: string): Promise<SavedLanguageCopy> {
  const [theirs, ours] = await Promise.all([getMessages({ locale: target }), getMessages()]);
  return savedLanguageCopy(target, here, (locale) => (locale === target ? theirs : ours));
}
