"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { GetHelpNow, SafetyCard } from "@/components/SafetyCard";
import { BoConsent } from "./BoConsent";
import { BoReply } from "./BoReply";
import { ClearBo } from "./ClearBo";
import { Link } from "@/i18n/navigation";
import { BO_CLIENT_WAIT_MS, BO_DEFAULT_MAX_CHARS, BO_ERROR_TEXT, BO_WAIT_RETRY_MS, boCardMayOpen, type BoMessage, type BoProblem, type BoSend, type BoStatus } from "@/lib/journal/bo";
import { BO_PICTURE_ACCEPT, preparePicture } from "@/lib/journal/boPicture";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { PRIMARY_SAVE } from "@/lib/ui/journalLayout";

// These end the conversation for now: there's no sending from here.
const CLOSED: BoProblem[] = ["region_off", "region_unknown", "bo_unavailable", "needs_email", "bo_resting"];
// The same message may simply go again, or (region_unknown: the route may have failed)
// Bo may answer on a second look.
const RETRY: BoProblem[] = ["bo_failed", "no_answer", "offline", "in_progress", "rate_limited", "region_unknown"];

async function callBo<T>(body: object): Promise<T | { status: "no_answer" }> {
  try {
    const answer = await fetch("/api/bo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(BO_CLIENT_WAIT_MS) });
    return (await answer.json()) as T;
  } catch {
    return { status: "no_answer" };
  }
}

// The conversation. Replies are plain text, never links or markup. The unsent text
// lives only here, in memory: never a draft, gone on leaving or signing out. Whether
// a turn was flagged is used and dropped, never kept (rule 6). The help button is
// always on screen, so every limit and error has it. On a phone it's a full screen
// with a back link, on a wider one the tabs stay (UX), through the mark on the root
// (globals.css), as SignedInMark does. The footer goes in both, so this page carries
// the Consumer Health Data link itself: it collects personal information (Footer).
export function BoConversation({ initial, country, back, healthData = false, consented = true, picturesAllowed = false }: { initial: BoMessage[]; country: string | null | undefined; back?: ReactNode; healthData?: boolean; consented?: boolean; picturesAllowed?: boolean }) {
  const t = useTranslations("bo");
  const tc = useTranslations("common");
  const tm = useTranslations("me");
  useLayoutEffect(() => {
    document.documentElement.dataset.boScreen = "";
    return () => {
      delete document.documentElement.dataset.boScreen;
    };
  }, []);
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<BoProblem | null>(null);
  // How many times the function has asked for the notice: each one says it was shown.
  const [noticeShows, setNoticeShows] = useState(0);
  const noticeLine = useRef<HTMLParagraphElement>(null);
  const [full, setFull] = useState(false);
  const [maxChars, setMaxChars] = useState(BO_DEFAULT_MAX_CHARS);
  const [card, setCard] = useState(false);
  // The page's read, and the function's answer on a send. The text stays, for after a yes.
  const [needsConsent, setNeedsConsent] = useState(!consented);
  const consentGiven = useCallback(() => setNeedsConsent(false), []);
  // Pictures: offered only when the flag allows and the function says so. One per message,
  // in memory only, shown for this visit; the object URLs go with the screen.
  const [picturesOffered, setPicturesOffered] = useState(false);
  const [picture, setPicture] = useState<{ url: string; base64: string } | null>(null);
  const [pictureState, setPictureState] = useState<"idle" | "reading" | "unreadable">("idle");
  const [pictureConsent, setPictureConsent] = useState<"not-yet" | "asking" | "given">("not-yet");
  const closePictureConsent = useCallback(() => setPictureConsent("not-yet"), []);
  const pictureInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  // A retry of the same message keeps its key, so it can't be answered or saved twice.
  const attempt = useRef<{ key: string; text: string; picture?: string } | null>(null);
  const cardOpenedAt = useRef<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const openCard = useCallback(() => {
    const now = Date.now();
    if (!boCardMayOpen(cardOpenedAt.current, now)) return;
    cardOpenedAt.current = now;
    setCard(true);
  }, []);
  const closeCard = useCallback(() => setCard(false), []);

  const showStatus = useCallback((status: BoStatus | { status: "no_answer" }) => {
    if (status.status === "ok") {
      setMaxChars(status.maxChars);
      setPicturesOffered(status.pictures);
      setProblem(status.available ? null : "region_unknown");
    } else if (status.status === "error") {
      if (status.code === "not_authenticated") window.location.reload();
      else setProblem(status.code);
    } else setProblem(navigator.onLine ? "region_unknown" : "offline");
  }, []);

  useEffect(() => {
    let current = true;
    void callBo<BoStatus>({ action: "status" }).then((status) => {
      if (current) showStatus(status);
    });
    return () => {
      current = false;
    };
  }, [showStatus]);

  // Only once it's really on screen, or the three-hour timer resets (bo.md). A long
  // conversation can have it out of view, so it waits to be seen.
  useEffect(() => {
    const line = noticeLine.current;
    if (noticeShows === 0 || !line) return;
    const shown = () => void callBo({ action: "notice_shown" });
    if (typeof IntersectionObserver === "undefined") return shown();
    const seen = new IntersectionObserver((entries, observer) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      shown();
    });
    seen.observe(line);
    return () => seen.disconnect();
  }, [noticeShows]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, sending]);

  const tooLong = [...text].length > maxChars;
  const closed = problem !== null && CLOSED.includes(problem);
  const canSend = (text.trim() !== "" || picture !== null) && !tooLong && !sending && !closed && pictureState !== "reading";

  // Over the limit the server stops before its crisis check, and Send is off, so
  // this is the only check that text gets: once, when it crosses (Mobile Dev, H10).
  const change = (next: string) => {
    if ([...next].length > maxChars && !tooLong && flagsCrisis(next, CRISIS_KEYWORDS)) openCard();
    // A line about the last send doesn't belong to what's now in the box.
    if (problem && !closed) setProblem(null);
    setText(next);
  };

  const send = async () => {
    if (!canSend) return;
    const sent = text;
    // Before any request: the card needs no network (as for entries, #190).
    if (flagsCrisis(sent, CRISIS_KEYWORDS)) openCard();
    if (attempt.current?.text !== sent || attempt.current.picture !== picture?.base64) attempt.current = { key: crypto.randomUUID(), text: sent, picture: picture?.base64 };
    // Known to be offline: no request. navigator.onLine can also say online with no
    // connection, and that ends as no_answer.
    if (!navigator.onLine) return setProblem("offline");
    const client_key = attempt.current.key;
    setSending(true);
    setProblem(null);
    // A retry sends the picture again: the function checks the key first, and ignores it
    // on a turn it already has (bo.md).
    const body = { action: "send", client_key, text: sent, ...(picture ? { picture: { media_type: "image/jpeg", data: picture.base64 } } : {}) };
    let answer = await callBo<BoSend>(body);
    // Another send of this key is running: wait, and retry once (bo.md).
    if (answer.status === "error" && answer.code === "in_progress") {
      await new Promise((done) => setTimeout(done, BO_WAIT_RETRY_MS));
      answer = await callBo<BoSend>(body);
    }
    setSending(false);
    if (answer.status === "ok") {
      if (answer.openCard) openCard();
      if (answer.showNotice) setNoticeShows((n) => n + 1);
      setFull(answer.conversationFull);
      const { reply, conversationFull } = answer;
      const pictureUrl = picture?.url;
      setPicture(null);
      setMessages((list) => [...list, { id: client_key, author: "person", body: sent, pictureUrl }, { id: `${client_key}-reply`, author: "ai", body: reply, sentWith: client_key, unkept: conversationFull }]);
      setText("");
      attempt.current = null;
      return;
    }
    if (answer.status === "no_answer") return setProblem(navigator.onLine ? "no_answer" : "offline");
    // The session went: the layout sends them to sign in.
    if (answer.code === "not_authenticated") return window.location.reload();
    // Nothing was sent or stored (bo.md).
    if (answer.code === "ai_consent_required") return setNeedsConsent(true);
    // The text can still go, without the picture.
    if (answer.code === "pictures_off" || answer.code === "pictures_need_email" || answer.code === "picture_limit") {
      setPicture(null);
      if (answer.code !== "picture_limit") setPicturesOffered(false);
    }
    setProblem(answer.code);
  };

  const choosePicture = async (file: File | undefined) => {
    if (!file) return;
    setPictureState("reading");
    const made = await preparePicture(file);
    if (!made.ok) {
      setPicture(null);
      return setPictureState("unreadable");
    }
    const url = URL.createObjectURL(made.blob);
    objectUrls.current.push(url);
    setPicture({ url, base64: made.base64 });
    setPictureState("idle");
  };

  // Its own moment, before the first picture of a visit. Declining sends nothing, and
  // text still works.
  const addPicture = () => {
    if (pictureConsent === "given") pictureInput.current?.click();
    else setPictureConsent("asking");
  };

  const retry = () => void (closed || text.trim() === "" ? callBo<BoStatus>({ action: "status" }).then(showStatus) : send());

  return (
    <div data-testid="bo-conversation" className="flex flex-col gap-4">
      <header data-testid="bo-header" className="sticky top-0 z-10 flex flex-wrap items-center gap-x-[8px] gap-y-[4px] bg-bg py-[8px]">
        {back && <div className="md:hidden">{back}</div>}
        <h1 className="min-w-0 flex-1 text-2xl font-medium text-text [overflow-wrap:anywhere]">{t("screenLine")}</h1>
        <GetHelpNow country={country} testId="bo-get-help" neutral />
      </header>
      <p className="text-sm text-muted">
        {t("smallLine")}
        {healthData && (
          <>
            {" "}
            <Link href="/consumer-health-data" data-testid="bo-health-data" className="underline underline-offset-4">
              {tc("consumerHealthData")}
            </Link>
          </>
        )}
      </p>
      <div role="log" aria-label={t("screenLine")} className="flex flex-col gap-3">
        {messages.length === 0 && <p className={bubble("ai")}>{t("firstLine")}</p>}
        {messages.map((m) =>
          m.author === "ai" ? (
            <BoReply key={m.id} message={m} className={bubble("ai")} />
          ) : (
            <div key={m.id} data-testid="bo-message-person" className={bubble("person")}>
              {m.pictureUrl ? (
                // A blob of this visit's, which an image optimiser can't take.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.pictureUrl} alt={t("pictureAlt")} data-testid="bo-message-picture" className="mb-[8px] max-h-[240px] max-w-full rounded-xl" />
              ) : (
                m.hasPicture && <p data-testid="bo-message-photo" className="text-sm text-muted">{t("pictureStored")}</p>
              )}
              {m.body}
            </div>
          ),
        )}
        {sending && (
          <p data-testid="bo-typing" className={bubble("ai")}>
            <span aria-hidden="true" className="inline-block h-[8px] w-[24px] rounded-full bg-border motion-safe:animate-pulse" />
            <span className="sr-only">{t("typing")}</span>
          </p>
        )}
      </div>
      {noticeShows > 0 && (
        <p ref={noticeLine} data-testid="bo-notice" className="rounded-2xl border border-border bg-surface p-[16px] text-sm text-text">
          {t("notice")}
        </p>
      )}
      <div ref={end} />
      {full && (
        <div data-testid="bo-full" className="flex flex-col items-start gap-2 text-sm text-text">
          <p>{t("conversationFull")}</p>
          <div className="flex flex-wrap items-center gap-[12px]">
            <Link href="/app/me#me-your-data" data-testid="bo-full-export" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
              {tm("meExport")}
            </Link>
            <ClearBo
              testId="bo-full-clear"
              onCleared={() => {
                setMessages([]);
                setFull(false);
              }}
            />
          </div>
        </div>
      )}
      {(problem || tooLong) && (
        <div role="alert" data-testid="bo-problem" className="flex flex-col items-start gap-2">
          <p className="text-text">{t(tooLong ? "tooLong" : BO_ERROR_TEXT[problem as BoProblem])}</p>
          {problem && RETRY.includes(problem) && !tooLong && (
            <button type="button" data-testid="bo-retry" disabled={sending} onClick={retry} className="inline-flex min-h-12 items-center rounded-full px-[12px] font-medium text-accent underline underline-offset-4">
              {t("tryAgain")}
            </button>
          )}
        </div>
      )}
      {needsConsent && !closed && <BoConsent onGiven={consentGiven} />}
      {!closed && !needsConsent && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            data-testid="bo-text"
            aria-label={t("messageBox")}
            placeholder={t("messageBox")}
            value={text}
            rows={3}
            autoComplete="off"
            onChange={(e) => change(e.target.value)}
            className="w-full rounded-2xl border border-border bg-surface p-[12px] text-text"
          />
          {picturesAllowed && picturesOffered && (
            <div className="flex flex-wrap items-center gap-[12px]">
              {/* No capture, so no camera; nothing asks for a browser permission. */}
              <input ref={pictureInput} type="file" accept={BO_PICTURE_ACCEPT} data-testid="bo-picture-input" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => {
                void choosePicture(e.target.files?.[0]);
                e.target.value = "";
              }} />
              {picture ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picture.url} alt={t("pictureAlt")} data-testid="bo-picture-preview" className="max-h-[96px] max-w-full rounded-xl" />
                  <button type="button" data-testid="bo-picture-remove" onClick={() => setPicture(null)} className={dialogButton()}>
                    {t("pictureRemove")}
                  </button>
                </>
              ) : (
                <button type="button" data-testid="bo-picture-add" disabled={pictureState === "reading"} onClick={addPicture} className={dialogButton()}>
                  {t("pictureAdd")}
                </button>
              )}
              {pictureState === "reading" && <p role="status" className="text-sm text-muted">{t("pictureReading")}</p>}
              {pictureState === "unreadable" && <p role="alert" data-testid="bo-picture-unreadable" className="text-sm text-text">{t("pictureUnreadable")}</p>}
            </div>
          )}
          <button type="submit" data-testid="bo-send" disabled={!canSend} className={PRIMARY_SAVE}>
            {t("send")}
          </button>
        </form>
      )}
      {pictureConsent === "asking" && (
        <Dialog title={t("pictureConsentTitle")} details={<p data-testid="bo-picture-consent-body" className="whitespace-pre-line text-text">{t("pictureConsentBody")}</p>} onCancel={closePictureConsent} testId="bo-picture-consent">
          <button type="button" data-testid="bo-picture-consent-decline" onClick={closePictureConsent} className={dialogButton()}>
            {t("consentDecline")}
          </button>
          <button
            type="button"
            data-testid="bo-picture-consent-accept"
            onClick={() => {
              setPictureConsent("given");
              pictureInput.current?.click();
            }}
            className={dialogButton(true)}
          >
            {t("pictureConsentAccept")}
          </button>
        </Dialog>
      )}
      {card && <SafetyCard country={country} onClose={closeCard} />}
    </div>
  );
}

const bubble = (author: BoMessage["author"]) =>
  `max-w-[90%] whitespace-pre-wrap rounded-2xl p-[12px] [overflow-wrap:anywhere] ${author === "person" ? "self-end bg-pill text-text" : "self-start border border-border bg-surface text-text"}`;
