import { getLocale, getTranslations } from "next-intl/server";
import { helplinesFor, isShortCode, telHref } from "@/lib/safety/helplines";

const link = "font-medium text-accent underline underline-offset-4";

// The card's help, on the page the help button leads to with no script running (#248): that
// country's numbers from the same list, in the card's words, and the directory always. A code
// that isn't on the list just gets the directory. No script here, so a short code iOS can't dial
// from a link has both the link and what to do with it.
export async function HelpNowLines({ country }: { country: string | undefined }) {
  const locale = await getLocale();
  const t = await getTranslations("safety");
  const tc = await getTranslations("common");
  const { helpline, emergency, directoryUrl } = helplinesFor(country, locale);
  return (
    <div data-testid="help-now-lines" className="mx-auto mt-6 max-w-2xl space-y-[12px] [font-size:min(1rem,max(10vw,32px))]">
      {helpline && (
        <p>
          <a href={telHref(helpline.dial)} data-testid="help-now-call-helpline" className={link}>
            {t("safetyCall", { name: helpline.name, number: helpline.display })}
          </a>
        </p>
      )}
      {helpline && isShortCode(helpline.dial) && <p data-testid="help-now-keypad">{t("safetyDialKeypad", { number: helpline.display })}</p>}
      {helpline?.hours && <p data-testid="help-now-hours">{helpline.hours}</p>}
      {emergency && (
        <p>
          <a href={telHref(emergency.dial)} data-testid="help-now-call-emergency" className={link}>
            {t("safetyCallEmergency", { number: emergency.display })}
          </a>
        </p>
      )}
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
