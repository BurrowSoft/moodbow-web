// Me's big card can hold the person's own picture (Vitor, 14 Nov; spec "Me: the big card is your own
// picture"; board 6b). For everyone, not Plus. In THIS browser only: IndexedDB, keyed by the user,
// never uploaded, not in the export, deleted on sign-out and by "Remove picture".
//
// No metadata survives: the file is decoded and drawn onto a canvas, cropped to the card (centre,
// 16:10, at most 1200 × 750), and the canvas is encoded afresh as JPEG. Only pixels are kept: no EXIF,
// no GPS, no camera details (a canvas has none to write).

// The card's shape (board 6b, 16:10) and the largest picture kept.
export const PICTURE_RATIO = 16 / 10;
export const PICTURE_MAX = { width: 1200, height: 750 } as const;
const DB = "moodbow-me";
const STORE = "pictures";

// The centre 16:10 part of a w × h picture, and the size it's drawn at (never larger than the
// source, never over 1200 × 750).
export function cropFor(w: number, h: number): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  const sw = Math.min(w, h * PICTURE_RATIO);
  const sh = sw / PICTURE_RATIO;
  const sx = (w - sw) / 2;
  const sy = (h - sh) / 2;
  const width = Math.max(1, Math.round(Math.min(PICTURE_MAX.width, sw)));
  return { sx, sy, sw, sh, width, height: Math.max(1, Math.round(width / PICTURE_RATIO)) };
}

// The file → the card's picture: decoded (the browser applies the photo's orientation), cropped and
// re-encoded through a canvas. Null when it can't be read as an image.
export async function encodePicture(file: Blob): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const c = cropFor(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = c.width;
    canvas.height = c.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, c.sx, c.sy, c.sw, c.sh, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((done) => canvas.toBlob((b) => done(b), "image/jpeg", 0.86));
  } finally {
    bitmap.close();
  }
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((done) => {
    try {
      if (typeof indexedDB === "undefined") return done(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((done) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        done(req.result ?? null);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        done(null);
      };
    } catch {
      db.close();
      done(null);
    }
  });
}

export const loadPicture = async (uid: string): Promise<Blob | null> => {
  const v = await run("readonly", (s) => s.get(uid) as IDBRequest<unknown>);
  return v instanceof Blob ? v : null;
};
// True when it was kept.
export const savePicture = async (uid: string, picture: Blob): Promise<boolean> => (await run("readwrite", (s) => s.put(picture, uid))) !== null;
export const removePicture = async (uid: string): Promise<void> => {
  await run("readwrite", (s) => s.delete(uid));
};
// Everyone's (a session that ended: this browser may be someone else's next).
export const clearPictures = async (): Promise<void> => {
  await run("readwrite", (s) => s.clear());
};
// Every picture but this user's (another person signed in here before: theirs goes).
export const removeOtherPictures = async (uid: string): Promise<void> => {
  const keys = await run("readonly", (s) => s.getAllKeys());
  for (const k of keys ?? []) if (k !== uid) await run("readwrite", (s) => s.delete(k));
};
