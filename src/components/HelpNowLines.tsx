import { getLocale, getTranslations } from "next-intl/server";
import { HelpNumberText } from "@/components/HelpNumberText";
import { helpLineSize, helplinesFor, isShortCode, telHref } from "@/lib/safety/helplines";

const link = "font-medium text-accent underline underline-offset-4";
const SIZE = "[font-size:min(1rem,max(10vw,32px))]";

// The card's help, on the page the help button leads to with no script running (#248): that
// country's numbers from the same list, in the card's words, directly under the heading, as getting
// someone their number is the point (UX). A code that isn't on the list has none. No script here, so
// a short code iOS can't dial from a link has both the link and what to do with it.
export async function HelpNowNumbers({ country }: { country: string | undefined }) {
  const locale = await getLocale();
  const t = await getTranslations("safety");
  const { helpline, emergency } = helplinesFor(country, locale);
  if (!helpline && !emergency) return null;
  return (
    <div data-testid="help-now-numbers" className={`mt-6 space-y-[12px] ${SIZE}`}>
      {helpline && (
        <p>
          <a href={telHref(helpline.dial)} data-testid="help-now-call-helpline" className={`${link} ${helpLineSize(helpline.display)}`}>
            <HelpNumberText text={t("safetyCall", { name: helpline.name, number: helpline.display })} number={helpline.display} />
          </a>
        </p>
      )}
      {helpline && isShortCode(helpline.dial) && (
        <p data-testid="help-now-keypad">
          <HelpNumberText text={t("safetyDialKeypad", { number: helpline.display })} number={helpline.display} />
        </p>
      )}
      {helpline?.hours && <p data-testid="help-now-hours">{helpline.hours}</p>}
      {emergency && (
        <p>
          <a href={telHref(emergency.dial)} data-testid="help-now-call-emergency" className={`${link} ${helpLineSize(emergency.display)}`}>
            <HelpNumberText text={t("safetyCallEmergency", { number: emergency.display })} number={emergency.display} />
          </a>
        </p>
      )}
    </div>
  );
}

// The directory, always, whatever the country, after the article.
export async function HelpNowLines() {
  const t = await getTranslations("safety");
  const tc = await getTranslations("common");
  const { directoryUrl } = helplinesFor(undefined);
  return (
    <div data-testid="help-now-lines" className={`mx-auto mt-6 max-w-2xl ${SIZE}`}>
      <p>
        <a href={directoryUrl} target="_blank" rel="noopener noreferrer" data-testid="help-now-find-helpline" className={link}>
          {t("safetyFindHelpline")}
          {" "}
          <span className="sr-only">{tc("opensInNewTab")}</span>
        </a>
      </p>
    </div>
  );
}
