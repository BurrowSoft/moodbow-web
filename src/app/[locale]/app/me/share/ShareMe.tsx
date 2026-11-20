"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { DEFAULT_EXPIRY, EXPIRY_DAYS, linkState, MAX_ACTIVE_LINKS, activeLinks, shareUrl, type ExpiryDays, type ShareLink } from "@/lib/share/shareLinks";
import type { SharedWeek } from "@/lib/share/trustedShare";
import { WeekSummary, type WeekStrings } from "../../../s/WeekSummary";
import { createShare, loadShareLinks, previewShare, stopShare } from "./actions";

// Me → Share your week (1.4 G; board 28 with UX's copy and rulings, 18 Nov):
// - the list: each link's name or number, when it ends, how often it's been opened, its routine
//   items, and Stop sharing (with a confirm). No Copy on an existing link: the token was shown once
//   and only its hash is kept (UX ruling 1);
// - a new link: an optional first name, the routine items (by default the appointment ones), the
//   expiry (7 / 30 / 90, 30 by default), the exact preview (share_preview through the viewer's own
//   WeekSummary), the consent line, Create. The web has no app lock, so no lock step (ruling 2);
// - once created: the link, once, with Copy and "make a new link if you lose it".
export type RoutineChoice = { id: string; name: string; inAppointment: boolean };
const noSubscribe = () => () => {};

export function ShareMe({ initialLinks, routine, dateLocaleTag }: { initialLinks: ShareLink[]; routine: RoutineChoice[]; dateLocaleTag: string }) {
  const t = useTranslations("shareMe");
  const tv = useTranslations("shareView");
  const tt = useTranslations("today");
  const locale = useLocale();
  const [links, setLinks] = useState(initialLinks);
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>(routine.filter((r) => r.inAppointment).map((r) => r.id));
  const [expiry, setExpiry] = useState<ExpiryDays>(DEFAULT_EXPIRY);
  const [preview, setPreview] = useState<SharedWeek | null>(null);
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<"limit" | "failed" | null>(null);
  const [stopping, setStopping] = useState<ShareLink | null>(null);
  const [pending, startTransition] = useTransition();
  // Rendered on the server too, where "now" would differ: the states settle in the browser.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const now = inBrowser ? new Date() : null;

  // The preview follows the options as they change (the same answer the viewer would get today).
  useEffect(() => {
    let cancelled = false;
    previewShare({ firstName: name, routineItemIds: items, expiryDays: expiry })
      .then((r) => !cancelled && setPreview(r))
      .catch(() => !cancelled && setPreview({ status: "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [name, items, expiry]);

  const weekStrings: WeekStrings = {
    weekOf: tv.raw("weekOf") as string,
    checkIns: Array.from({ length: 8 }, (_, n) => tv("checkIns", { count: n })),
    routinePercent: tv.raw("routinePercent") as string,
    routineNotEnough: tv.raw("routineNotEnough") as string,
    none: tv("none"),
    dayNone: tv.raw("dayNone") as string,
    moods: [1, 2, 3, 4, 5].map((m) => tt(`mood${m}` as "mood1")),
  };
  const ends = new Intl.DateTimeFormat(dateLocaleTag, { day: "numeric", month: "short" });
  const itemNames = (ids: string[]) => routine.filter((r) => ids.includes(r.id)).map((r) => r.name).join(", ");
  const full = now !== null && activeLinks(links, now).length >= MAX_ACTIVE_LINKS;

  const create = () =>
    startTransition(async () => {
      setError(null);
      const r = await createShare({ firstName: name, routineItemIds: items, expiryDays: expiry });
      if (r.status !== "ok") return setError(r.error);
      setCreated({ url: shareUrl(window.location.origin, locale === "en" ? "" : `/${locale}`, r.token) });
      setCopied(false);
      setName("");
      const listed = await loadShareLinks();
      if (listed.status === "ok") setLinks(listed.links);
    });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const stop = (link: ShareLink) =>
    startTransition(async () => {
      const r = await stopShare(link.id);
      setStopping(null);
      if (r.status === "ok") setLinks(r.links);
      else setError("failed");
    });

  return (
    <div className="space-y-6">
      <p className="text-muted">{t("intro")}</p>

      {created && (
        <section aria-labelledby="share-created-title" data-testid="share-created" className="space-y-3 rounded-3xl border border-border bg-surface px-[16px] py-[16px]">
          <h2 id="share-created-title" tabIndex={-1} className="text-lg font-medium text-text">
            {t("createdTitle")}
          </h2>
          <p className="text-muted">{t("createdLine")}</p>
          <p data-testid="share-created-url" className="rounded-xl bg-bg px-[12px] py-[8px] font-mono text-sm text-text [overflow-wrap:anywhere]">
            {created.url}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" data-testid="share-copy" onClick={() => void copy()} className={dialogButton(true)}>
              {copied ? t("copied") : t("copy")}
            </button>
            <button type="button" data-testid="share-created-done" onClick={() => setCreated(null)} className={dialogButton()}>
              {t("done")}
            </button>
          </div>
          <p role="status" className="sr-only">
            {copied ? t("copied") : ""}
          </p>
        </section>
      )}

      {links.length > 0 && (
        <section aria-labelledby="share-list-title" className="space-y-3">
          <h2 id="share-list-title" className="text-lg font-medium text-text">
            {t("listTitle")}
          </h2>
          <ul className="space-y-3" data-testid="share-links">
            {links.map((link, i) => {
              const state = now ? linkState(link, now) : "active";
              return (
                <li key={link.id} data-testid="share-link" data-state={state} className={`space-y-1 rounded-3xl border border-border bg-surface px-[16px] py-[14px] ${state === "active" ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-text [overflow-wrap:anywhere]">{link.first_name ? t("linkNamed", { name: link.first_name }) : t("linkNumbered", { n: links.length - i })}</span>
                    <span className="text-sm text-muted">{state === "stopped" ? t("stopped") : state === "ended" ? t("ended") : t("ends", { date: ends.format(new Date(link.expires_at)) })}</span>
                  </div>
                  <p className="text-sm text-muted">
                    {t("opened", { count: link.view_count })}
                    {link.include_routine && itemNames(link.routine_item_ids) ? ` · ${t("routineIncluded", { items: itemNames(link.routine_item_ids) })}` : ""}
                  </p>
                  {state === "active" && (
                    <button type="button" data-testid="share-stop" onClick={() => setStopping(link)} className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent underline underline-offset-4">
                      {t("stop")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="share-new-title" className="space-y-4 rounded-3xl border border-border bg-surface px-[16px] py-[16px]">
        <h2 id="share-new-title" className="text-lg font-medium text-text">
          {t("newTitle")}
        </h2>
        {full ? (
          <p data-testid="share-limit" className="text-text">
            {t("limit")}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="share-name" className="block font-medium text-text">
                {t("nameLabel")}
              </label>
              <input id="share-name" data-testid="share-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-describedby="share-name-hint" className="block w-full rounded-2xl border border-border bg-bg px-[16px] py-[12px] text-text" />
              <p id="share-name-hint" className="text-sm text-muted">
                {t("nameHint")}
              </p>
            </div>
            {routine.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="font-medium text-text">{t("routineLabel")}</legend>
                {routine.map((r) => (
                  <label key={r.id} className="flex min-h-[44px] items-center gap-3 text-text [overflow-wrap:anywhere]">
                    <input type="checkbox" data-testid={`share-item-${r.id}`} checked={items.includes(r.id)} onChange={(e) => setItems((now) => (e.target.checked ? [...now, r.id] : now.filter((x) => x !== r.id)))} className="h-5 w-5" />
                    {r.name}
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset className="space-y-2">
              <legend className="font-medium text-text">{t("endsLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_DAYS.map((d) => (
                  <label key={d} className="inline-flex min-h-[44px] items-center gap-[8px] rounded-full border border-border px-[14px] text-text">
                    <input type="radio" name="share-expiry" data-testid={`share-expiry-${d}`} checked={expiry === d} onChange={() => setExpiry(d)} />
                    {t(`ends${d}` as "ends7")}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-3">
              <h3 className="font-medium text-text">{t("previewTitle")}</h3>
              <p className="text-sm text-muted">{t("previewLine")}</p>
              <div data-testid="share-preview" className="rounded-2xl border border-border bg-bg px-[14px] py-[14px]">
                {preview?.status === "ok" ? (
                  <div className="space-y-3">
                    {/* The viewer's own heading, with the name as they'll see it. */}
                    <p data-testid="preview-title" className="font-semibold text-text [overflow-wrap:anywhere]">
                      {preview.first_name ? tv("titleNamed", { name: preview.first_name }) : tv("titleAnon")}
                    </p>
                    <WeekSummary week={preview} strings={weekStrings} locale={dateLocaleTag} headingId="share-preview-title" prefix="preview" />
                  </div>
                ) : null}
              </div>
            </div>
            <p data-testid="share-consent" className="text-sm text-muted">
              {t("consent")}
            </p>
            {error && (
              <p role="alert" data-testid="share-error" className="font-medium text-accent">
                {error === "limit" ? t("limit") : tt("errGeneric")}
              </p>
            )}
            <button type="button" data-testid="share-create" disabled={pending} onClick={create} className={`${dialogButton(true)} min-h-[48px] w-full disabled:opacity-50`}>
              {t("create")}
            </button>
          </>
        )}
      </section>

      {stopping && (
        <Dialog title={t("stopConfirm")} onCancel={() => setStopping(null)} testId="share-stop-dialog">
          <button type="button" data-testid="share-stop-yes" disabled={pending} onClick={() => stop(stopping)} className={dialogButton(true)}>
            {t("stopYes")}
          </button>
          <button type="button" data-testid="share-stop-no" onClick={() => setStopping(null)} className={dialogButton()}>
            {t("stopNo")}
          </button>
        </Dialog>
      )}
    </div>
  );
}
