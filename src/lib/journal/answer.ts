// "Write your answer" under a reflection (decision 151): the editor opens at
// the end of the entry with the reflection's question quoted on a new line,
// as plain text. No chat: the answer is just more of the person's own entry.

// The reflection's closing question (reflect.md: a few sentences, then one
// question). The last sentence that ends in a question mark; failing that,
// the last sentence.
export function lastQuestion(reflection: string): string {
  const sentences = reflection
    .split(/\n+|(?<=[?？.!。！])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...sentences].reverse().find((s) => /[?？]$/.test(s)) ?? sentences[sentences.length - 1] ?? "";
}

// The entry with the question quoted after it, a blank line between, and
// a new line under it to answer on.
export function withQuestion(body: string, question: string): string {
  const text = body.replace(/\s+$/, "");
  return `${text}${text ? "\n\n" : ""}“${question}”\n`;
}
