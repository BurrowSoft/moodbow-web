"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { HelpNumberText } from "@/components/HelpNumberText";
import { dialogButton } from "@/lib/ui/dialogButton";
import { helpLineSize, isIos } from "@/lib/safety/helplines";

// Helpline numbers with * or # (Chile's *4141; the app's S14, UX 23 Nov, corrected after the Reviewer): iOS won't dial
// them from a link, Android and computers do. So on iOS there's no link: the name, the number large and selectable,
// how to call it (planDialByHand) and Copy number. Everywhere else the link stays, with Copy number under it. The
// strings come from the caller, so a server page (the no-script help page, #248) can use these without sending its
// namespace to the browser. iOS is known only once a script runs: the page's own HTML always has the link.

const noSubscribe = () => () => {};
const useScripted = () => useSyncExternalStore(noSubscribe, () => true, () => false);
const useIos = () => useSyncExternalStore(noSubscribe, () => isIos(navigator.userAgent, navigator.maxTouchPoints), () => false);

type Strings = { dialByHand: string; copyLabel: string; copiedLabel: string };

// Copy number: copies the number exactly as dialled and says Copied, also to a screen reader (role="status"). It
// needs a script, so the button appears only once one runs. Copied goes back to Copy number after a while, so
// copying again is said again; with no clipboard nothing is claimed (the number stays there to select).
export function CopyNumber({ dial, testId, copyLabel, copiedLabel }: { dial: string; testId: string; copyLabel: string; copiedLabel: string }) {
  const scripted = useScripted();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dial);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      {scripted && (
        <p>
          <button type="button" data-testid={`${testId}-copy`} onClick={() => void copy()} className={dialogButton()}>
            {copied ? copiedLabel : copyLabel}
          </button>
        </p>
      )}
      <p role="status" data-testid={`${testId}-copied`} className="sr-only">
        {copied ? copiedLabel : ""}
      </p>
    </>
  );
}

// iOS: no link. The helpline's name on its own line (the registry's names carry their article for "Call {name}",
// "the Suicide Prevention Line", so it starts with a capital here), the number, how to call it, Copy number.
export function DialByHand({ name, display, dial, testId, dialByHand, copyLabel, copiedLabel, lineClass = "text-muted" }: { name: string; display: string; dial: string; testId: string; lineClass?: string } & Strings) {
  const title = name.charAt(0).toLocaleUpperCase() + name.slice(1);
  return (
    <div data-testid={testId} data-dial-by-hand="" className="space-y-[max(4px,calc(20px-1rem))]">
      <p className="font-medium text-text">
        <span data-help-name="">{title}</span>
      </p>
      <p data-testid={`${testId}-number`} className={`select-all font-medium text-text ${helpLineSize(display)}`}>
        <HelpNumberText text={display} number={display} />
      </p>
      <p data-testid={`${testId}-how`} className={lineClass}>
        {dialByHand}
      </p>
      <CopyNumber dial={dial} testId={testId} copyLabel={copyLabel} copiedLabel={copiedLabel} />
    </div>
  );
}

// A * or # helpline wherever one is shown: on iOS (once known) DialByHand; otherwise the caller's link, Copy number
// under it, and with how (the no-script help page) how to type it, for an iPhone with no script whose link does
// nothing. All-digit numbers never come here.
export function ShortCodeLine({ link, name, display, dial, testId, how = false, lineClass = "text-muted", ...strings }: { link: ReactNode; name: string; display: string; dial: string; testId: string; how?: boolean; lineClass?: string } & Strings) {
  const ios = useIos();
  if (ios) return <DialByHand name={name} display={display} dial={dial} testId={testId} lineClass={lineClass} {...strings} />;
  return (
    <div data-testid={`${testId}-linked`} className="space-y-[max(4px,calc(20px-1rem))]">
      {link}
      {how && (
        <p data-testid={`${testId}-how`} className={lineClass}>
          {strings.dialByHand}
        </p>
      )}
      <CopyNumber dial={dial} testId={testId} copyLabel={strings.copyLabel} copiedLabel={strings.copiedLabel} />
    </div>
  );
}
