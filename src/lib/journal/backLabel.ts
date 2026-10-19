import { getTranslations } from "next-intl/server";
import { originDay, type Origin } from "./origin";
import { dateLine } from "./today";

// "Back to Today" / "Back to Timeline" / "Back to Fri, Oct 2": the name of
// the screen Back returns to (navBackTo, decision 152).
export async function backLabel(origin: Origin, dateLocaleTag: string): Promise<string> {
  const t = await getTranslations("app");
  const day = originDay(origin);
  const screen = day ? dateLine(day, dateLocaleTag) : origin === "/app" ? t("tabToday") : t("tabTimeline");
  return t("navBackTo", { screen });
}
