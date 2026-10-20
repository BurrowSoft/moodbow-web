// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "./csv";

describe("parseCsv (RFC 4180, M2)", () => {
  it("fields, quoted delimiters, doubled quotes and line breaks inside quotes", () => {
    expect(parseCsv('a,b,c\n1,"x, y","say ""hi"""\n2,"line one\nline two",z\n')).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"'],
      ["2", "line one\nline two", "z"],
    ]);
  });

  it("CRLF line ends, a byte-order mark, blank lines skipped, a last line without a newline", () => {
    expect(parseCsv("﻿date,mood\r\n2026-10-01,3\r\n\r\n2026-10-02,4")).toEqual([
      ["date", "mood"],
      ["2026-10-01", "3"],
      ["2026-10-02", "4"],
    ]);
  });

  it("semicolons, detected from the header (a comma inside quotes doesn't count)", () => {
    expect(detectDelimiter('date;mood;note\n2026-10-01;3;"a, b"')).toBe(";");
    expect(detectDelimiter('"a;b",c,d\n')).toBe(",");
    expect(parseCsv('date;mood;note\n2026-10-01;3;"a, b; c"')).toEqual([
      ["date", "mood", "note"],
      ["2026-10-01", "3", "a, b; c"],
    ]);
  });

  it("empty input: no rows", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("an unterminated quote: null, never a guess (reviewer #92 B3)", () => {
    expect(parseCsv('date,mood,note\n2026-10-01,3,"never closed\n2026-10-02,4,x\n')).toBeNull();
    expect(parseCsv('a,"b')).toBeNull();
  });
});
