// @vitest-environment node
import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import it_ from "@/messages/it.json";
import ptBr from "@/messages/pt-br.json";
import th from "@/messages/th.json";
import { DELETE_WORD, deleteWordTyped, exportFileName, journalFileName, localDay } from "./account";

// The typed word (app #141's cases, delete_word_test.dart).
describe("deleteWordTyped", () => {
  for (const [locale, word] of [["en", "DELETE"], ["th", "DELETE"], ["fr", "SUPPRIMER"], ["es", "ELIMINAR"], ["pt-br", "EXCLUIR"], ["de", "LÖSCHEN"], ["it", "ELIMINA"]]) {
    it(`${locale}: ${word}, in any case, or DELETE`, () => {
      expect(deleteWordTyped(word, locale)).toBe(true);
      expect(deleteWordTyped(` ${word.toLowerCase()} `, locale)).toBe(true);
      expect(deleteWordTyped("DELETE", locale)).toBe(true);
      expect(deleteWordTyped("delete", locale)).toBe(true);
      expect(deleteWordTyped(word.slice(1), locale)).toBe(false);
      expect(deleteWordTyped("", locale)).toBe(false);
      expect(deleteWordTyped("   ", locale)).toBe(false);
    });
  }
  it("another language's word is not accepted", () => {
    expect(deleteWordTyped("LÖSCHEN", "fr")).toBe(false);
    expect(deleteWordTyped("SUPPRIMER", "en")).toBe(false);
  });
  it("German without umlauts: LOESCHEN and LOSCHEN too, any case", () => {
    for (const t of ["LÖSCHEN", "LOESCHEN", "LOSCHEN", "loeschen", "Löschen"]) expect(deleteWordTyped(t, "de"), t).toBe(true);
    expect(deleteWordTyped("LOEESCHEN", "de")).toBe(false);
  });
  it("pt: EXCLUIR and APAGAR", () => {
    expect(deleteWordTyped("apagar", "pt-br")).toBe(true);
    expect(deleteWordTyped("APAGAR", "es")).toBe(false);
  });
  it("the word each language's page asks for is one it accepts, and the steps name it", () => {
    for (const [locale, m] of Object.entries({ en, th, fr, es, "pt-br": ptBr, de, it: it_ })) {
      expect(deleteWordTyped(m.me.deleteWord, locale), locale).toBe(true);
      expect(m.me.deleteTypeConfirm, locale).toContain("{word}");
      expect(m.accountDeletion.steps, locale).toContain(m.me.deleteWord);
    }
    expect(ptBr.me.deleteWord).toBe("APAGAR");
  });
});

// Coverage pass (UX): the export files' names and the day they carry.
describe("account helpers", () => {
  it("DELETE is the same word in every language", () => {
    expect(DELETE_WORD).toBe("DELETE");
  });

  it("file names carry the export day; without one, plain names", () => {
    expect(exportFileName("2026-10-02")).toBe("moodbow-export-2026-10-02.json");
    expect(exportFileName("")).toBe("moodbow-export.json");
    expect(journalFileName("2026-10-02")).toBe("moodbow-journal-2026-10-02.txt");
    expect(journalFileName("")).toBe("moodbow-journal.txt");
  });

  it("localDay: the calendar day in the zone; UTC for an unknown zone; blank for a bad instant", () => {
    expect(localDay("2026-10-02T23:30:00Z", "Asia/Bangkok")).toBe("2026-10-03");
    expect(localDay("2026-10-02T23:30:00Z", "America/Sao_Paulo")).toBe("2026-10-02");
    expect(localDay("2026-10-02T23:30:00Z", "Not/AZone")).toBe("2026-10-02");
    expect(localDay("not a date", "UTC")).toBe("");
    expect(localDay("", "UTC")).toBe("");
  });
});
