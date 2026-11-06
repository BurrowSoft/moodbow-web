"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { GetHelpNow, SafetyCard } from "@/components/SafetyCard";
import { Link } from "@/i18n/navigation";
import { BO_CLIENT_WAIT_MS, BO_DEFAULT_MAX_CHARS, BO_ERROR_TEXT, BO_WAIT_RETRY_MS, boCardMayOpen, type BoMessage, type BoProblem, type BoSend, type BoStatus } from "@/lib/journal/bo";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { PRIMARY_SAVE } from "@/lib/ui/journalLayout";

// These end the conversation for now: there's no sending from here.
const CLOSED: BoProblem[] = ["region_off", "region_unknown", "bo_unavailable", "needs_email", "bo_resting"];
// The same message may simply go again.
const RETRY: BoProblem[] = ["bo_failed", "no_answer", "offline", "in_progress", "rate_limited"];

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
export function BoConversation({ initial, country, back, healthData = false }: { initial: BoMessage[]; country: string | null | undefined; back?: ReactNode; healthData?: boolean }) {
  const t = useTranslations("bo");
  const tc = useTranslations("common");
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
  const [notice, setNotice] = useState(false);
  const [full, setFull] = useState(false);
  const [maxChars, setMaxChars] = useState(BO_DEFAULT_MAX_CHARS);
  const [card, setCard] = useState(false);
  // A retry of the same message keeps its key, so it can't be answered or saved twice.
  const attempt = useRef<{ key: string; text: string } | null>(null);
  const cardOpenedAt = useRef<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const openCard = useCallback(() => {
    const now = Date.now();
    if (!boCardMayOpen(cardOpenedAt.current, now)) return;
    cardOpenedAt.current = now;
    setCard(true);
  }, []);
  const closeCard = useCallback(() => setCard(false), []);

  useEffect(() => {
    let current = true;
    void callBo<BoStatus>({ action: "status" }).then((status) => {
      if (!current) return;
      if (status.status === "ok") {
        setMaxChars(status.maxChars);
        if (!status.available) setProblem("region_unknown");
      } else if (status.status === "error") {
        if (status.code === "not_authenticated") window.location.reload();
        else setProblem(status.code);
      } else setProblem(navigator.onLine ? "region_unknown" : "offline");
    });
    return () => {
      current = false;
    };
  }, []);

  // Only once it's really on screen, or the three-hour timer resets (bo.md).
  useEffect(() => {
    if (notice) void callBo({ action: "notice_shown" });
  }, [notice]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, sending]);

  const tooLong = [...text].length > maxChars;
  const closed = problem !== null && CLOSED.includes(problem);
  const canSend = text.trim() !== "" && !tooLong && !sending && !closed;

  // Over the limit the server stops before its crisis check, and Send is off, so
  // this is the only check that text gets: once, when it crosses (Mobile Dev, H10).
  const change = (next: string) => {
    if ([...next].length > maxChars && !tooLong && flagsCrisis(next, CRISIS_KEYWORDS)) openCard();
    setText(next);
  };

  const send = async () => {
    if (!canSend) return;
    const sent = text;
    // Before any request: the card needs no network (as for entries, #190).
    if (flagsCrisis(sent, CRISIS_KEYWORDS)) openCard();
    if (attempt.current?.text !== sent) attempt.current = { key: crypto.randomUUID(), text: sent };
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
    if (answer.status === "ok") {
      if (answer.openCard) openCard();
      if (answer.showNotice) setNotice(true);
      setFull(answer.conversationFull);
      const { reply } = answer;
      setMessages((list) => [...list, { id: client_key, author: "person", body: sent }, { id: `${client_key}-reply`, author: "ai", body: reply }]);
      setText("");
      attempt.current = null;
      return;
    }
    if (answer.status === "no_answer") return setProblem(navigator.onLine ? "no_answer" : "offline");
    // The session went: the layout sends them to sign in.
    if (answer.code === "not_authenticated") return window.location.reload();
    setProblem(answer.code);
  };

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
      {notice && (
        <p data-testid="bo-notice" className="rounded-2xl border border-border bg-surface p-[16px] text-sm text-text">
          {t("notice")}
        </p>
      )}
      <div role="log" aria-label={t("screenLine")} className="flex flex-col gap-3">
        {messages.length === 0 && <p className={bubble("ai")}>{t("firstLine")}</p>}
        {messages.map((m) => (
          <p key={m.id} data-testid={`bo-message-${m.author}`} className={bubble(m.author)}>
            {m.body}
          </p>
        ))}
        {sending && (
          <p data-testid="bo-typing" className={bubble("ai")}>
            <span aria-hidden="true" className="inline-block h-[8px] w-[24px] rounded-full bg-border motion-safe:animate-pulse" />
            <span className="sr-only">{t("typing")}</span>
          </p>
        )}
      </div>
      <div ref={end} />
      {full && (
        <p data-testid="bo-full" className="text-sm text-text">
          {t("conversationFull")}
        </p>
      )}
      {(problem || tooLong) && (
        <div role="alert" data-testid="bo-problem" className="flex flex-col items-start gap-2">
          <p className="text-text">{t(tooLong ? "tooLong" : BO_ERROR_TEXT[problem as BoProblem])}</p>
          {problem && RETRY.includes(problem) && !tooLong && (
            <button type="button" data-testid="bo-retry" disabled={sending} onClick={() => void send()} className="inline-flex min-h-12 items-center rounded-full px-[12px] font-medium text-accent underline underline-offset-4">
              {t("tryAgain")}
            </button>
          )}
        </div>
      )}
      {!closed && (
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
          <button type="submit" data-testid="bo-send" disabled={!canSend} className={PRIMARY_SAVE}>
            {t("send")}
          </button>
        </form>
      )}
      {card && <SafetyCard country={country} onClose={closeCard} />}
    </div>
  );
}

const bubble = (author: BoMessage["author"]) =>
  `max-w-[90%] whitespace-pre-wrap rounded-2xl p-[12px] [overflow-wrap:anywhere] ${author === "person" ? "self-end bg-pill text-text" : "self-start border border-border bg-surface text-text"}`;
