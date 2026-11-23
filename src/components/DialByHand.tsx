"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { HelpNumberText } from "@/components/HelpNumberText";
import { dialogButton } from "@/lib/ui/dialogButton";
import { helpLineSize } from "@/lib/safety/helplines";

const noSubscribe = () => () => {};

// A helpline number with * or # (Chile's *4141; the app's S14, UX 23 Nov): iOS won't dial it from a link and the
// web can't reliably tell iOS Safari apart, so on every device there's no call link. The helpline's name on its own
// line, the number large and selectable, how to call it (planDialByHand), then Copy number, which copies it exactly as
// dialled and says Copied, also to a screen reader (role="status"). The strings come from the caller, so a server
// page (the no-script help page, #248) can use it without sending its namespace to the browser. The button needs a
// script, so it appears only once one runs: without it, the number is there to read and type.
export function DialByHand({ name, display, dial, testId, dialByHand, copyLabel, copiedLabel, lineClass = "text-muted" }: { name: string; display: string; dial: string; testId: string; dialByHand: string; copyLabel: string; copiedLabel: string; lineClass?: string }) {
  const scripted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [copied, setCopied] = useState(false);
  // Copied goes back to Copy number after a while, so copying again is said again.
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
      // No clipboard (an old browser, or permission): the number stays there to select.
      setCopied(false);
    }
  };
  // The registry's names carry their article for "Call {name}" ("the Suicide Prevention Line"); on its own line the
  // name starts with a capital.
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
    </div>
  );
}
