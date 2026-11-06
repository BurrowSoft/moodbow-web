import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import registry from "../../content/contracts/countries.json";
import messages from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import ptBr from "@/messages/pt-br.json";
import { helplinesFor, isIos, telHref } from "@/lib/safety/helplines";
import { GetHelpNow, SafetyCard } from "./SafetyCard";

// The safety card (M8, decision 124) and its numbers from countries.json.
const s = messages.safety;
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
afterEach(cleanup);

describe("helplinesFor", () => {
  it("a listed country: its helpline and emergency number, verified or not (TH ships as listed)", () => {
    expect(helplinesFor("TH")).toMatchObject({ helpline: { name: "the Department of Mental Health hotline", display: "1323", dial: "1323" }, emergency: { dial: "1669" } });
    expect(helplinesFor("us").helpline).not.toBeNull();
  });
  it("the helpline's name in the UI language where the registry has one, else English", () => {
    expect(helplinesFor("TH", "th").helpline?.name).toBe("สายด่วนสุขภาพจิต กรมสุขภาพจิต");
    expect(helplinesFor("TH", "en").helpline?.name).toBe("the Department of Mental Health hotline");
    expect(helplinesFor("US", "th").helpline?.name).toBe(helplinesFor("US").helpline?.name);
  });
  it("unknown or none: only the directory", () => {
    expect(helplinesFor("ZZ")).toEqual({ helpline: null, emergency: null, directoryUrl: "https://findahelpline.com" });
    expect(helplinesFor(null).helpline).toBeNull();
  });
  it("names read after the verb, with their article, and fall back to English", () => {
    expect(helplinesFor("FR", "fr").helpline?.name).toBe("le numéro national de prévention du suicide");
    expect(helplinesFor("BR", "pt-br").helpline?.name).toBe("o CVV");
    expect(helplinesFor("BR", "de").helpline?.name).toBe("CVV");
  });
  // The web has its own "Call {name}" template: the whole label, for every country.
  it.each([["fr", fr], ["es", es], ["pt-br", ptBr]] as const)("%s: every country's call label reads, with no stray English article and no \"a el\"", (language, translated) => {
    const t = createTranslator({ locale: language, messages: translated, namespace: "safety" });
    const lines = registry.countries.map((c) => helplinesFor(c.code, language).helpline).filter((line) => line !== null);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const label = t("safetyCall", { name: line.name, number: line.display });
      expect(label).toContain(line.display);
      expect(label).not.toMatch(/\bthe\b/i);
      expect(label).not.toMatch(/\ba el\b/i);
    }
  });
  it("hours only for a line that isn't always open, in the UI language, else English", () => {
    expect(helplinesFor("AR", "es").helpline?.hours).toBe("Todos los días, de 8:00 a 24:00");
    expect(helplinesFor("AR", "de").helpline?.hours).toBe("8 am to midnight, every day");
    expect(helplinesFor("FR", "fr").helpline?.hours).toBeNull();
  });
  it("a country with no verified line: the emergency number only", () => {
    expect(helplinesFor("CO").helpline).toBeNull();
    expect(helplinesFor("CO").emergency?.dial).toBe("123");
  });
  it("tel: links keep digits, +, * and #, with # as %23", () => {
    expect(telHref("0800 111 0 111")).toBe("tel:08001110111");
    expect(telHref("+44 116 123")).toBe("tel:+44116123");
    expect(telHref("*4141")).toBe("tel:*4141");
    expect(telHref("*123#")).toBe("tel:*123%23");
    expect(telHref("12#34")).toBe("tel:12%2334");
    expect(telHref("(020) 7-123")).toBe("tel:0207123");
  });
  it("iOS: iPhone and iPad, an iPad that says it's a Mac, not a real Mac or Android", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 14)", 5)).toBe(false);
  });
});

describe("SafetyCard", () => {
  it("focus on the title; the helpline and emergency number as tel: links; not-therapy line", () => {
    wrap(<SafetyCard country="TH" onClose={() => {}} />);
    const card = screen.getByTestId("safety-card");
    expect(screen.getByRole("heading", { name: s.safetyTitle })).toHaveFocus();
    expect(card).toHaveTextContent(s.safetyBody);
    expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:1323");
    expect(screen.getByTestId("safety-call-helpline")).toHaveTextContent("Call the Department of Mental Health hotline (1323)");
    expect(screen.getByTestId("safety-call-emergency")).toHaveAttribute("href", "tel:1669");
    // The visible text is the spoken name (safetyCallEmergency).
    expect(screen.getByRole("link", { name: "Call emergency number 1669" })).toBe(screen.getByTestId("safety-call-emergency"));
    expect(card).toHaveTextContent(s.safetyNotTherapy);
    // The directory is always there too, under the numbers (decision 135).
    expect(screen.getByTestId("safety-find-helpline")).toHaveAttribute("href", "https://findahelpline.com");
  });

  it("no known country: the directory link and 'your local emergency number'", () => {
    wrap(<SafetyCard country={null} onClose={() => {}} />);
    expect(screen.getByTestId("safety-find-helpline")).toHaveAttribute("href", "https://findahelpline.com");
    expect(screen.getByTestId("safety-card")).toHaveTextContent(s.safetyEmergency);
    expect(screen.queryByTestId("safety-call-helpline")).toBeNull();
  });

  it("a country with no verified line: the emergency number and the directory, no helpline", () => {
    wrap(<SafetyCard country="CO" onClose={() => {}} />);
    expect(screen.queryByTestId("safety-call-helpline")).toBeNull();
    expect(screen.queryByTestId("safety-helpline-hours")).toBeNull();
    expect(screen.getByTestId("safety-call-emergency")).toHaveAttribute("href", "tel:123");
    expect(screen.getByTestId("safety-find-helpline")).toBeInTheDocument();
  });

  it("a line with set hours says them under its number; an always-open one doesn't", () => {
    const view = wrap(<SafetyCard country="AR" onClose={() => {}} />);
    expect(screen.getByTestId("safety-helpline-hours")).toHaveTextContent("8 am to midnight, every day");
    view.unmount();
    wrap(<SafetyCard country="FR" onClose={() => {}} />);
    expect(screen.queryByTestId("safety-helpline-hours")).toBeNull();
  });

  describe("a short code (Chile's *4141)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("a link everywhere but iOS", () => {
      wrap(<SafetyCard country="CL" onClose={() => {}} />);
      expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:*4141");
      expect(screen.queryByTestId("safety-helpline-keypad")).toBeNull();
    });

    it("on iOS: no link, the number, and to dial it by hand", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
      wrap(<SafetyCard country="CL" onClose={() => {}} />);
      expect(screen.queryByTestId("safety-call-helpline")).toBeNull();
      expect(screen.getByTestId("safety-card")).toHaveTextContent("*4141");
      expect(screen.getByTestId("safety-helpline-keypad")).toHaveTextContent(s.safetyDialKeypad.replace("{number}", "*4141"));
    });

    it("on iOS an ordinary number is still a link", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
      wrap(<SafetyCard country="FR" onClose={() => {}} />);
      expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:3114");
    });
  });

  it("Close and Esc close it", () => {
    const onClose = vi.fn();
    wrap(<SafetyCard country="GB" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("safety-close"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Close is the secondary (outline) button, not the accent fill (decision 206)", () => {
    wrap(<SafetyCard country="GB" onClose={() => {}} />);
    expect(screen.getByTestId("safety-close")).toHaveClass("border");
    expect(screen.getByTestId("safety-close")).not.toHaveClass("bg-accent");
  });

  it("Get help now opens it, and closing it returns focus to the button", () => {
    wrap(<GetHelpNow country="GB" testId="me-get-help" />);
    const button = screen.getByTestId("me-get-help");
    expect(button).toHaveTextContent(messages.me.meGetHelpNow);
    button.focus();
    fireEvent.click(button);
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("safety-close"));
    expect(screen.queryByTestId("safety-card")).toBeNull();
    expect(button).toHaveFocus();
  });
});

describe("Get help now's style (decision 128)", () => {
  it("a calm secondary button, not the accent fill", () => {
    wrap(<GetHelpNow country="GB" testId="me-get-help" />);
    const button = screen.getByTestId("me-get-help");
    expect(button.className).toContain("border-border");
    expect(button.className).not.toContain("bg-accent");
  });
});

describe("SafetyCard: each number once (#9765 S-03) and the new-tab cue", () => {
  it("each number appears once, inside its link; Find a helpline says it opens a new tab", () => {
    wrap(<SafetyCard country="TH" onClose={() => {}} />);
    const text = screen.getByTestId("safety-card").textContent ?? "";
    expect(text.split("1323")).toHaveLength(2);
    expect(text.split("1669")).toHaveLength(2);
    expect(screen.getByTestId("safety-call-helpline")).toHaveTextContent("1323");
    expect(screen.getByTestId("safety-call-emergency")).toHaveTextContent("1669");
    expect(screen.getByTestId("safety-find-helpline")).toHaveAccessibleName(`${s.safetyFindHelpline} ${messages.common.opensInNewTab}`);
  });
});

describe("SafetyCard: the opener (#9765 S-03)", () => {
  it("from Me (neutral): safetyBodyNeutral, not safetyBody", () => {
    wrap(<GetHelpNow country="TH" testId="me-get-help" neutral />);
    fireEvent.click(screen.getByTestId("me-get-help"));
    const card = screen.getByTestId("safety-card");
    expect(card).toHaveTextContent(s.safetyBodyNeutral);
    expect(card).not.toHaveTextContent(s.safetyBody);
  });
  it("after a flag or a crisis signal (the default): safetyBody", () => {
    wrap(<GetHelpNow country="TH" testId="reflect-get-help" />);
    fireEvent.click(screen.getByTestId("reflect-get-help"));
    expect(screen.getByTestId("safety-card")).toHaveTextContent(s.safetyBody);
    expect(screen.getByTestId("safety-card")).not.toHaveTextContent(s.safetyBodyNeutral);
  });
});
