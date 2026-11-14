"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { encodePicture, loadPicture, removeOtherPictures, removePicture, savePicture } from "@/lib/me/picture";
import { onSignOut } from "@/lib/signOutSignal";

// Me's big card (board 6b): the rainbow by default with the pencil badge; one button, "Choose a
// picture for this space", opens the browser's file picker. The picture is cropped to the card and
// re-encoded (no metadata), kept in this browser only (lib/me/picture), and "Remove picture" brings
// the rainbow back. A sign-out in any tab deletes it.
export function MePicture({ uid }: { uid: string }) {
  const t = useTranslations("me");
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = (picture: Blob | null) =>
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return picture ? URL.createObjectURL(picture) : null;
    });

  useEffect(() => {
    let live = true;
    // Someone else's picture from an earlier session in this browser never stays (the Reviewer).
    void removeOtherPictures(uid);
    void loadPicture(uid).then((p) => live && p && show(p));
    const off = onSignOut((m) => {
      if (m.uid !== uid) return;
      void removePicture(uid);
      show(null);
    });
    return () => {
      live = false;
      off();
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    };
  }, [uid]);

  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setFailed(false);
    const picture = await encodePicture(file);
    if (picture && (await savePicture(uid, picture))) show(picture);
    else setFailed(true);
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  const remove = async () => {
    await removePicture(uid);
    show(null);
    setFailed(false);
  };

  return (
    <section aria-label={t("pictureRegion")} data-testid="me-picture" className="space-y-2">
      <button
        type="button"
        aria-label={t("pictureChoose")}
        data-testid="me-picture-choose"
        data-has-picture={url ? "" : undefined}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="relative flex aspect-[16/10] w-full max-w-[560px] items-center justify-center overflow-hidden rounded-[20px] bg-[radial-gradient(90%_90%_at_50%_40%,#FDF3F6_0%,#F6E6EE_70%,#F1DEE8_100%)]"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
          <img src={url} alt="" data-testid="me-picture-img" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            {/* The faint sparkle dots on the default rainbow (board 6b), gone with a picture. */}
            <svg aria-hidden="true" data-testid="me-picture-sparkles" width="100%" height="100%" viewBox="0 0 350 220" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 opacity-50">
              <g fill="#FFFFFF">
                <circle cx="40" cy="40" r="3" />
                <circle cx="300" cy="60" r="2.5" />
                <circle cx="270" cy="170" r="3" />
                <circle cx="70" cy="180" r="2" />
                <circle cx="180" cy="30" r="2" />
              </g>
            </svg>
          <svg aria-hidden="true" width="128" height="128" viewBox="0 0 64 64" fill="none" strokeLinecap="round" strokeWidth="6" className="relative">
            <path d="M8 46a24 24 0 0 1 48 0" stroke="#E07A8E" />
            <path d="M16 46a16 16 0 0 1 32 0" stroke="#F2C66D" />
            <path d="M24 46a8 8 0 0 1 16 0" stroke="#A99BD6" />
          </svg>
          </>
        )}
        <span aria-hidden="true" className="absolute right-[12px] bottom-[12px] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(43,36,56,.16)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A8456A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4L19 9l-4-4L4 16v4z" />
          </svg>
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden data-testid="me-picture-input" onChange={(e) => void choose(e.target.files?.[0])} />
      {url && (
        <button type="button" data-testid="me-picture-remove" onClick={() => void remove()} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4">
          {t("pictureRemove")}
        </button>
      )}
      {failed && (
        <p role="alert" data-testid="me-picture-failed" className="text-sm font-medium text-accent">
          {t("pictureFailed")}
        </p>
      )}
    </section>
  );
}
