import { getLocale, getTranslations } from "next-intl/server";
import { ShortCodeLine } from "@/components/DialByHand";
import { HelpNumberText } from "@/components/HelpNumberText";
import { helpLineSize, helplinesFor, isShortCode, telHref } from "@/lib/safety/helplines";

const link = "font-medium text-accent underline underline-offset-4";
const SIZE = "[font-size:min(1rem,max(10vw,32px))]";

// The card's help, on the page the help button leads to with no script running (#248): that
// country's numbers from the same list, in the card's words, directly under the heading, as getting
// someone their number is the point (UX). A code that isn't on the list has none. A number with * or #
// (S14, UX 23 Nov): with no script, the link (Android and computers dial it) and how to type it (an iPhone
// can't); once a script runs, iOS gets the number to type and Copy number, everyone else Copy number under the link.
export async function HelpNowNumbers({ country }: { country: string | undefined }) {
  const locale = await getLocale();
  const t = await getTranslations("safety");
  const { helpline, emergency } = helplinesFor(country, locale);
  if (!helpline && !emergency) return null;
  const call = helpline && (
    <p>
      <a href={telHref(helpline.dial)} data-testid="help-now-call-helpline" className={`${link} ${helpLineSize(helpline.display)}`}>
        <HelpNumberText text={t("safetyCall", { name: helpline.name, number: helpline.display })} number={helpline.display} name={helpline.name} />
      </a>
    </p>
  );
  return (
    <div data-testid="help-now-numbers" className={`mt-6 space-y-[12px] ${SIZE}`}>
      {helpline && isShortCode(helpline.dial) ? (
        <ShortCodeLine link={call} how name={helpline.name} display={helpline.display} dial={helpline.dial} testId="help-now-helpline-byhand" dialByHand={t("planDialByHand")} copyLabel={t("planCopyNumber")} copiedLabel={t("planNumberCopied")} lineClass="" />
      ) : (
        call
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
