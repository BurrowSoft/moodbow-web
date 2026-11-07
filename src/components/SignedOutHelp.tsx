import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "@/i18n/clientMessages";
import { GetHelpNow } from "./SafetyCard";

// Help on the signed-out account pages (decision 218): the helpline directory, as no country
// is known here. The card and its words only come to these pages, which the root layout doesn't
// send them to. The wrapper holds the button under the safety card's cap, as on Consent.
export async function SignedOutHelp({ testId }: { testId: string }) {
  return (
    <NextIntlClientProvider messages={pickMessages(await getMessages(), ["me", "safety", "common"])}>
      <div className="mt-[24px] [font-size:min(1rem,max(10vw,32px))] [&_button]:min-h-[44px]">
        <GetHelpNow country={null} testId={testId} neutral />
      </div>
    </NextIntlClientProvider>
  );
}
