// CSV formula injection (1.1 P, decision 201; OWASP): a spreadsheet runs a
// cell that starts with = + - @, a tab or a CR as a formula, so the export
// puts one ' in front of such a cell (a spreadsheet shows it as text), and
// our import takes exactly that ' off again. The same pattern on both sides
// (any number of ' and then one of those) makes it exact both ways: "=x" ↔
// "'=x", "- milk" ↔ "'- milk", "'=x" ↔ "''=x"; anything else ("'hello",
// "it's") is never touched (UX §P).
const FORMULA = /^'*[=+\-@\t\r]/;

export const neutralizeCell = (cell: string) => (FORMULA.test(cell) ? `'${cell}` : cell);

export const restoreCell = (cell: string) => (cell.startsWith("'") && FORMULA.test(cell.slice(1)) ? cell.slice(1) : cell);
