"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import { encodeForUpload } from "@/lib/journal/pictureEncode";
import { PICTURES, type EntryPicture } from "@/lib/journal/pictures";
import type { PictureAddResult } from "@/app/api/pictures/route";
import { PlusLock } from "../../PlusSheet";
import { deletePicture } from "./pictureActions";

// An entry's pictures (035; board 20): a row of square thumbnails under the text, each opening the
// picture full size, each with × to remove it; and, on a moment with room, a "+" tile to add one.
// Without Plus the tile is a lock to the Plus screen (adding is Plus; viewing and removing never
// are). The pictures are the person's own photos, shown from signed URLs of at most 5 minutes with
// plain <img> (never next/image). Never in AI, share cards or notifications.
export type PictureAdd = "open" | "locked" | "none";
type Failure = "failed" | "quota" | "generic";

export function EntryPictures({ entryId, pictures, onChange, add }: { entryId: string; pictures: EntryPicture[]; onChange: (next: EntryPicture[]) => void; add: PictureAdd }) {
  const t = useTranslations("entry");
  const tt = useTranslations("today");
  const tp = useTranslations("plus");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const room = pictures.length < PICTURES.perEntry;

  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const encoded = await encodeForUpload(file);
      if (!encoded) return setFailure("failed");
      const form = new FormData();
      form.set("entry", entryId);
      form.set("width", String(encoded.width));
      form.set("height", String(encoded.height));
      form.set("full", new File([encoded.full], "picture.jpg", { type: "image/jpeg" }));
      form.set("thumb", new File([encoded.thumb], "picture_t.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/pictures", { method: "POST", body: form });
      const result = (await res.json().catch(() => null)) as PictureAddResult | null;
      if (result?.status === "ok") onChange([...pictures, result.picture]);
      else setFailure(result?.status === "error" && result.error === "picture_quota" ? "quota" : result?.status === "error" && result.error === "invalid" ? "failed" : "generic");
    } catch {
      setFailure("generic");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const remove = async (id: string) => {
    setFailure(null);
    const result = await deletePicture(id).catch(() => null);
    if (result?.status === "ok") onChange(pictures.filter((p) => p.id !== id));
    else setFailure("generic");
  };

  if (pictures.length === 0 && add === "none") return null;
  const tile = "relative aspect-square w-full overflow-hidden rounded-xl";
  return (
    <section aria-label={t("picturesRegion")} data-testid="entry-pictures" className="space-y-2">
      {/* Three across, but never narrower than 5.5rem: at large text the tiles go to two or one per
          row, so the 44 px ✕ always leaves the open button a clear area (the a11y sweep, #326:
          axe target-size at 300 % on 320 px), and never wider than the list itself (min(100%, …):
          5.5rem at 300 % is 264 px, past a 224 px column). Gaps in px. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,max(5.5rem,calc((100%_-_16px)/3))),1fr))] gap-[8px]">
        {pictures.map((p, i) => (
          <li key={p.id} className="relative" data-testid="entry-picture">
            <button type="button" onClick={() => setViewing(i)} aria-label={t("pictureOpen", { n: i + 1, total: pictures.length })} data-testid="entry-picture-open" className={tile}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL: never through the image optimizer */}
              <img src={p.thumb} alt="" className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => void remove(p.id)}
              aria-label={t("pictureRemove", { n: i + 1 })}
              data-testid="entry-picture-remove"
              className="absolute top-[4px] right-[4px] inline-flex h-[44px] w-[44px] items-center justify-center"
            >
              <span aria-hidden="true" className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-surface/90 text-text shadow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </button>
          </li>
        ))}
        {room && add === "open" && (
          <li>
            <button type="button" disabled={busy} onClick={() => input.current?.click()} data-testid="entry-picture-add" aria-label={t("pictureAdd")} className={`${tile} flex items-center justify-center border-[1.5px] border-dashed border-border text-muted`}>
              <CameraPlus />
            </button>
            <input ref={input} type="file" accept="image/*" hidden data-testid="entry-picture-input" onChange={(e) => void choose(e.target.files?.[0])} />
          </li>
        )}
        {room && add === "locked" && (
          <li>
            <Link href="/app/me/plus" data-testid="entry-picture-camera" data-locked="" aria-label={t("pictureAddLocked")} className={`${tile} flex flex-col items-center justify-center gap-1 border-[1.5px] border-dashed border-border text-muted`}>
              <CameraPlus />
              <PlusLock />
            </Link>
          </li>
        )}
      </ul>
      {busy && (
        <p role="status" data-testid="entry-picture-busy" className="text-sm text-muted">
          {t("pictureAdding")}
        </p>
      )}
      {failure && (
        <p role="alert" data-testid={failure === "quota" ? "entry-pictures-quota" : "entry-picture-error"} className="text-sm font-medium text-accent">
          {failure === "quota" ? t("pictureQuota") : failure === "failed" ? t("pictureFailed") : tt("errGeneric")}
        </p>
      )}
      {viewing !== null && pictures[viewing] && (
        <Dialog title={t("pictureOpen", { n: viewing + 1, total: pictures.length })} onCancel={() => setViewing(null)} testId="entry-picture-view">
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL: never through the image optimizer */}
          <img src={pictures[viewing].full} alt={t("pictureOpen", { n: viewing + 1, total: pictures.length })} data-testid="entry-picture-full" className="max-h-[70vh] w-full rounded-xl object-contain" />
          <button type="button" className={dialogButton(true)} onClick={() => setViewing(null)} data-testid="entry-picture-close">
            {tp("close")}
          </button>
        </Dialog>
      )}
    </section>
  );
}

function CameraPlus() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  );
}
