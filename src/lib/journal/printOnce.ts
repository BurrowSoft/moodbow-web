// "Print this month" opens the print dialog once, on arriving from the link
// (UX, 1.1 N): the link's click asks for it here, in memory, and the print
// page takes it. A refresh starts with nothing asked (a new page), and Back
// or Forward finds it already taken, so neither opens the dialog again.
// Nothing goes into the URL or storage. The page's Print button is always
// there.
let asked: string | null = null;

export function askToPrint(month: string) {
  asked = month;
}

export function takePrintRequest(month: string): boolean {
  const yes = asked === month;
  asked = null;
  return yes;
}
