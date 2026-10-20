// RFC 4122 UUID version 5 (SHA-1, name-based) with WebCrypto, no package.
// Import entry ids (1.1 K, H1): the same file always gives the same ids, so
// a re-import finds them already there and writes nothing.

// The namespace for Moodbow import entry ids (fixed; any v4 would do).
export const IMPORT_NAMESPACE = "1f0c2a9e-5c3b-4d7e-9a61-3b8f2d4e6c10";

const hexToBytes = (uuid: string) => Uint8Array.from(uuid.replace(/-/g, "").match(/../g)!.map((h) => parseInt(h, 16)));

export async function uuidv5(name: string, namespace: string = IMPORT_NAMESPACE): Promise<string> {
  const ns = hexToBytes(namespace);
  const data = new TextEncoder().encode(name);
  const buf = new Uint8Array(ns.length + data.length);
  buf.set(ns);
  buf.set(data, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", buf)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...hash].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// An imported note's id: the person, the day, the time and the text.
export const importEntryId = (uid: string, entry: { date: string; time: string | null; body: string }) =>
  uuidv5(`${uid}|${entry.date}|${entry.time ?? ""}|${entry.body}`);
