// A slow phone: the entry box is on screen before the page's code has run, and
// the person is already typing. The editor then mounts afresh in the browser
// (EntryEditor, for the draft), so what they typed, the focus and the caret are
// read from the server's box while it's still in the document, and carried over.
// This relies on the server's box being empty, as it is on the write page (and
// the edit page has no box until load): React resets a non-empty one at hydration.
export type ServerBox = {
  // What was typed, or null if the box still holds what the server sent.
  body: string | null;
  serverBody: string;
  date: string | null;
  focused: boolean;
  start: number;
  end: number;
};

export function readServerBox(): ServerBox | null {
  const box = document.getElementById("entry-text");
  if (!(box instanceof HTMLTextAreaElement)) return null;
  const date = document.getElementById("entry-date");
  return {
    body: box.value !== box.defaultValue ? box.value : null,
    serverBody: box.defaultValue,
    date: date instanceof HTMLInputElement && date.value && date.value !== date.defaultValue ? date.value : null,
    focused: document.activeElement === box,
    start: box.selectionStart,
    end: box.selectionEnd,
  };
}

// The text to start from, and where the caret goes. Nothing is lost: with a
// draft in this browser, what was typed goes under it (they hadn't seen the
// draft yet, and it mustn't be overwritten either).
export function withTyped(body: string, box: ServerBox | null, hasDraft: boolean): { body: string; start: number; end: number } {
  if (!box) return { body, start: 0, end: 0 };
  if (box.body === null) {
    // In the box, about to type, and the draft is arriving: they carry on after
    // it, on a new line, not in front of it.
    const draft = body.trimEnd();
    if (hasDraft && box.focused && draft) {
      const after = `${draft}\n\n`;
      return { body: after, start: after.length, end: after.length };
    }
    return { body, start: Math.min(box.start, body.length), end: Math.min(box.end, body.length) };
  }
  if (!hasDraft || box.body === body) return { body: box.body, start: box.start, end: box.end };
  const added = box.serverBody && box.body.startsWith(box.serverBody) ? box.body.slice(box.serverBody.length) : box.body;
  const text = added.trimStart();
  if (!text) return { body, start: body.length, end: body.length };
  const kept = body.trimEnd();
  const prefix = kept ? `${kept}\n\n` : "";
  const shift = prefix.length - (box.body.length - text.length);
  return { body: `${prefix}${text}`, start: Math.max(prefix.length, box.start + shift), end: Math.max(prefix.length, box.end + shift) };
}
