"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { GetHelpNow, SafetyCard } from "@/components/SafetyCard";
import { BoConsent } from "./BoConsent";
import { BoReply } from "./BoReply";
import { ClearBo } from "./ClearBo";
import { Link } from "@/i18n/navigation";
import { BO_CLIENT_WAIT_MS, BO_DEFAULT_MAX_CHARS, BO_ERROR_TEXT, BO_WAIT_RETRY_MS, boCardMayOpen, type BoMessage, type BoProblem, type BoSend, type BoStatus } from "@/lib/journal/bo";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { useKeyboardOpen } from "@/lib/ui/keyboardOpen";
import { PRIMARY_SAVE } from "@/lib/ui/journalLayout";

const BO_HEADER_MOST = 0.25;
// The usual save button, whose height doesn't grow with the text: at 300 % it took a quarter of
// a phone's window, and pushed a failed send's line out of view.
const BO_SEND = `${PRIMARY_SAVE} !min-h-[48px] !py-[8px] !px-[24px]`;
// Beside the box while a phone's keyboard is up, so the row, the box and Send all fit in what's
// left of the window, at 300 % too: the text is capped and the height doesn't grow with it.
const BO_TYPING_SEND = "inline-flex min-h-[48px] max-w-[45%] shrink-0 items-center justify-center rounded-full bg-accent px-[12px] text-center font-medium text-on-accent [font-size:min(1rem,max(8vw,16px))] [overflow-wrap:anywhere] hover:bg-accent-hover disabled:opacity-50";
// The compact row's text, capped to the phone, and a help button that doesn't grow with it.
const BO_END_TEXT = "[font-size:min(1rem,max(8vw,16px))]";
const BO_END_HELP = `inline-flex min-h-[44px] max-w-full items-center justify-center rounded-full border border-border bg-bg px-[12px] text-center font-medium text-text hover:bg-pill ${BO_END_TEXT}`;

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
// The keys that scroll a page, outside a field.
const BO_SCROLL_KEYS = ["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End", " "];

export function BoConversation({ initial, country, back, healthData = false, consented = true }: { initial: BoMessage[]; country: string | null | undefined; back?: ReactNode; healthData?: boolean; consented?: boolean }) {
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
  // The reply it came with: it sits above that one, so reading it leads into the reply (UX).
  const [noticeBefore, setNoticeBefore] = useState<string | null>(null);
  const noticeLine = useRef<HTMLParagraphElement>(null);
  const [full, setFull] = useState(false);
  const [maxChars, setMaxChars] = useState(BO_DEFAULT_MAX_CHARS);
  const [card, setCard] = useState(false);
  // The page's read, and the function's answer on a send. The text stays, for after a yes.
  const [needsConsent, setNeedsConsent] = useState(!consented);
  const consentGiven = useCallback(() => setNeedsConsent(false), []);
  // A retry of the same message keeps its key, so it can't be answered or saved twice.
  const attempt = useRef<{ key: string; text: string } | null>(null);
  const cardOpenedAt = useRef<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  // The line and help are always on screen (UX; the disclosures in specs/bo-risk-read.md).
  // At large text the header can fill the window and cover what's under it, so past a
  // quarter of it, it scrolls away and a compact row holds them at the bottom instead.
  // Whichever is pinned, focus and scrolling clear it. A phone's keyboard shrinks only what's
  // visible, leaving anything sticky out of sight (Reviewer), so while it's up they sit just
  // above the box, which is what the browser keeps in view.
  const keyboard = useKeyboardOpen();
  const typingRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (keyboard) typingRow.current?.scrollIntoView?.({ block: "nearest" });
  }, [keyboard]);
  const header = useRef<HTMLElement>(null);
  const [pinned, setPinned] = useState(true);
  const endRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = header.current;
    if (!bar) return;
    const root = document.documentElement;
    const measure = () => {
      const fits = bar.offsetHeight <= window.innerHeight * BO_HEADER_MOST;
      setPinned(fits);
      root.style.scrollPaddingTop = fits ? `${bar.offsetHeight}px` : "";
      root.style.scrollPaddingBottom = fits ? "" : `${endRow.current?.offsetHeight ?? 0}px`;
    };
    measure();
    window.addEventListener("resize", measure);
    const watcher = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    watcher?.observe(bar);
    if (endRow.current) watcher?.observe(endRow.current);
    return () => {
      window.removeEventListener("resize", measure);
      watcher?.disconnect();
      root.style.scrollPaddingTop = "";
      root.style.scrollPaddingBottom = "";
    };
  }, [pinned]);

  const openCard = useCallback(() => {
    const now = Date.now();
    if (!boCardMayOpen(cardOpenedAt.current, now)) return;
    cardOpenedAt.current = now;
    setCard(true);
  }, []);
  const box = useRef<HTMLTextAreaElement>(null);
  // Back to the box, rather than to nothing: Send is off while a message goes, so it can't
  // take the focus back itself.
  const closeCard = useCallback(() => {
    setCard(false);
    requestAnimationFrame(() => box.current?.focus());
  }, []);

  const showStatus = useCallback((status: BoStatus | { status: "no_answer" }) => {
    if (status.status === "ok") {
      setMaxChars(status.maxChars);
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

  // To the end, unless that leaves the start of a line about this send above the window, as
  // at large text: then to its start, as the start is what says what happened (UX, #205). A
  // notice or a full conversation from an earlier send doesn't pull the page back. A new reply
  // that doesn't fit shows its start too, on arrival only, and a person who scrolled away while
  // it came stays where they went. Bo's line and help stay in the window: they're sticky.
  const problemLine = useRef<HTMLDivElement>(null);
  const fullLine = useRef<HTMLDivElement>(null);
  const placed = useRef({ noticeShows: 0, full: false, reply: initial.at(-1)?.id });
  // What the person did, not how far the page moved: a phone's keyboard closing as Send goes
  // off moves it too (Reviewer). A scrollbar drag isn't seen, and just goes to the reply.
  const scrolledAway = useRef(false);
  useEffect(() => {
    if (!sending) return;
    scrolledAway.current = false;
    const scrolled = () => {
      scrolledAway.current = true;
    };
    const key = (e: KeyboardEvent) => {
      if (BO_SCROLL_KEYS.includes(e.key) && !(e.target as Element | null)?.closest?.("textarea, input, select")) scrolled();
    };
    window.addEventListener("wheel", scrolled, { passive: true });
    window.addEventListener("touchmove", scrolled, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("wheel", scrolled);
      window.removeEventListener("touchmove", scrolled);
      window.removeEventListener("keydown", key);
    };
  }, [sending]);
  useEffect(() => {
    const newNotice = noticeShows !== placed.current.noticeShows;
    const newFull = full && !placed.current.full;
    const last = messages.at(-1);
    const newReply = last?.author === "ai" && last.id !== placed.current.reply;
    if (!(newReply && scrolledAway.current)) {
      end.current?.scrollIntoView?.({ block: "end" });
      const replies = document.querySelectorAll<HTMLElement>('[data-testid="bo-message-ai"]');
      const line = problemLine.current ?? (newNotice ? noticeLine.current : newFull ? fullLine.current : newReply ? replies[replies.length - 1] : null);
      // The pinned header, when there is one, is this much of the window's top.
      const top = parseFloat(document.documentElement.style.scrollPaddingTop) || 0;
      if (line && line.getBoundingClientRect().top < top) line.scrollIntoView?.({ block: "start" });
    }
    placed.current = { noticeShows, full, reply: last?.id };
  }, [messages, sending, problem, noticeShows, full]);

  const tooLong = [...text].length > maxChars;
  const closed = problem !== null && CLOSED.includes(problem);
  const canSend = text.trim() !== "" && !tooLong && !sending && !closed;

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
    if (attempt.current?.text !== sent) attempt.current = { key: crypto.randomUUID(), text: sent };
    // Known to be offline: no request. navigator.onLine can also say online with no
    // connection, and that ends as no_answer.
    if (!navigator.onLine) return setProblem("offline");
    const client_key = attempt.current.key;
    setSending(true);
    setProblem(null);
    let answer = await callBo<BoSend>({ action: "send", client_key, text: sent });
    // Another send of this key is running: wait, and retry once (bo.md).
    if (answer.status === "error" && answer.code === "in_progress") {
      await new Promise((done) => setTimeout(done, BO_WAIT_RETRY_MS));
      answer = await callBo<BoSend>({ action: "send", client_key, text: sent });
    }
    setSending(false);
    // Send was off while it went, which dropped focus; back to the box, where the text is.
    requestAnimationFrame(() => box.current?.focus({ preventScroll: true }));
    if (answer.status === "ok") {
      if (answer.openCard) openCard();
      if (answer.showNotice) {
        setNoticeShows((n) => n + 1);
        setNoticeBefore(`${client_key}-reply`);
      }
      setFull(answer.conversationFull);
      const { reply, conversationFull } = answer;
      setMessages((list) => [...list, { id: client_key, author: "person", body: sent }, { id: `${client_key}-reply`, author: "ai", body: reply, sentWith: client_key, unkept: conversationFull }]);
      setText("");
      attempt.current = null;
      return;
    }
    if (answer.status === "no_answer") return setProblem(navigator.onLine ? "no_answer" : "offline");
    // The session went: the layout sends them to sign in.
    if (answer.code === "not_authenticated") return window.location.reload();
    // Nothing was sent or stored (bo.md).
    if (answer.code === "ai_consent_required") return setNeedsConsent(true);
    setProblem(answer.code);
  };

  const retry = () => void (closed || text.trim() === "" ? callBo<BoStatus>({ action: "status" }).then(showStatus) : send());

  return (
    <div data-testid="bo-conversation" className="flex flex-col gap-4 [overflow-wrap:anywhere]">
      <header ref={header} data-testid="bo-header" data-pinned={pinned ? "" : undefined} className={`flex flex-wrap items-center gap-x-[8px] gap-y-[4px] bg-bg py-[8px] ${pinned && !keyboard ? "sticky top-0 z-10" : ""}`}>
        {back && <div className="md:hidden">{back}</div>}
        <h1 className="min-w-0 flex-1 font-medium leading-[1.33] text-text [font-size:min(1.5rem,max(10vw,24px,1rem))] [overflow-wrap:anywhere]">{t("screenLine")}</h1>
        <GetHelpNow country={country} testId="bo-get-help" neutral />
      </header>
      <p className="text-sm text-muted">
        {t("smallLine")}
        {" "}
        <Link href="/help/bo" data-testid="bo-help" className="underline underline-offset-4">
          {t("helpLink")}
        </Link>
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
            <Fragment key={m.id}>
              {m.id === noticeBefore && (
                <p ref={noticeLine} data-testid="bo-notice" className="rounded-2xl border border-border bg-surface p-[16px] text-sm text-text">
                  {t("notice")}
                </p>
              )}
              <BoReply message={m} className={bubble("ai")} />
            </Fragment>
          ) : (
            <p key={m.id} data-testid="bo-message-person" className={bubble("person")}>
              {m.body}
            </p>
          ),
        )}
        {sending && (
          <p data-testid="bo-typing" className={bubble("ai")}>
            <span aria-hidden="true" className="inline-block h-[8px] w-[24px] rounded-full bg-border motion-safe:animate-pulse" />
            <span className="sr-only">{t("typing")}</span>
          </p>
        )}
      </div>
      {full && (
        <div ref={fullLine} data-testid="bo-full" className="flex flex-col items-start gap-2 text-sm text-text">
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
        <div ref={problemLine} role="alert" data-testid="bo-problem" className="flex flex-col items-start gap-2">
          <p className={`text-text ${BO_END_TEXT}`}>{t(tooLong ? "tooLong" : BO_ERROR_TEXT[problem as BoProblem])}</p>
          {problem && RETRY.includes(problem) && !tooLong && (
            <button type="button" data-testid="bo-retry" disabled={sending} onClick={retry} className={`inline-flex min-h-[44px] items-center rounded-full px-[12px] font-medium text-accent underline underline-offset-4 ${BO_END_TEXT}`}>
              {t("tryAgain")}
            </button>
          )}
        </div>
      )}
      {needsConsent && !closed && <BoConsent onGiven={consentGiven} />}
      {!closed && !needsConsent && (
        <form
          className={`flex gap-2 ${keyboard ? "flex-row flex-wrap items-end" : "flex-col"}`}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {keyboard && (
            <div ref={typingRow} data-testid="bo-typing-row" className="flex w-full flex-wrap items-center justify-between gap-x-[8px] gap-y-[2px]">
              <p className={`min-w-0 font-medium leading-tight text-text [overflow-wrap:anywhere] ${BO_END_TEXT}`}>{t("screenLine")}</p>
              <GetHelpNow country={country} testId="bo-get-help-typing" className={BO_END_HELP} neutral />
            </div>
          )}
          <textarea
            ref={box}
            data-testid="bo-text"
            aria-label={t("messageBox")}
            placeholder={t("messageBox")}
            value={text}
            rows={keyboard ? 2 : 3}
            // At most this tall, and scrolling inside, at any text size: a phone's keyboard leaves
            // about half the window, and the line and help sit just above this.
            autoComplete="off"
            onChange={(e) => change(e.target.value)}
            className={`w-full resize-none overflow-y-auto rounded-2xl border border-border bg-surface p-[12px] text-text ${keyboard ? "max-h-[96px] min-w-0 flex-1 basis-0" : "max-h-[160px]"}`}
          />
          <button type="submit" data-testid="bo-send" disabled={!canSend} className={keyboard ? BO_TYPING_SEND : BO_SEND}>
            {t("send")}
          </button>
        </form>
      )}
      {!pinned && !keyboard && (
        <div ref={endRow} data-testid="bo-end-row" className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-[8px] gap-y-[2px] bg-bg py-[4px]">
          <p data-testid="bo-end-line" className={`min-w-0 font-medium leading-tight text-text [overflow-wrap:anywhere] ${BO_END_TEXT}`}>
            {t("screenLine")}
          </p>
          <GetHelpNow country={country} testId="bo-get-help-end" className={BO_END_HELP} neutral />
        </div>
      )}
      {card && <SafetyCard country={country} onClose={closeCard} />}
      <div ref={end} />
    </div>
  );
}

const bubble = (author: BoMessage["author"]) =>
  `max-w-[90%] whitespace-pre-wrap rounded-2xl p-[12px] [overflow-wrap:anywhere] ${author === "person" ? "self-end bg-pill text-text" : "self-start border border-border bg-surface text-text"}`;
