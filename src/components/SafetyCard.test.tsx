import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import registry from "../../content/contracts/countries.json";
import messages from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import ptBr from "@/messages/pt-br.json";
import { helpLineSize, helplinesFor, isIos, telHref } from "@/lib/safety/helplines";
import { GetHelpNow, SafetyCard } from "./SafetyCard";
import { Dialog } from "@/components/Dialog";
// My safety plan (1.2): whether it has content, asked once the card is open.
let planHas: boolean | "never" = false;
vi.mock("@/app/[locale]/app/me/safety-plan/actions", () => ({
  safetyPlanHasContent: () => (planHas === "never" ? new Promise(() => {}) : Promise.resolve(planHas)),
}));
import { RequestCountryProvider } from "./RequestCountry";
import { usableCountry } from "@/lib/region/requestCountry";
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

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

describe("Get help now with or without the page's scripts (#248)", () => {
  it("is a link, so it works with none; once running, a click opens the card and stays on the page", () => {
    wrap(<GetHelpNow country="GB" testId="me-get-help" />);
    const link = screen.getByTestId("me-get-help");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toMatch(/\/help\/get-help-now\?country=GB$/);
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
  });

  it("with no country known, the link carries none", () => {
    wrap(<GetHelpNow country={null} testId="me-get-help" />);
    expect(screen.getByTestId("me-get-help").getAttribute("href")).toMatch(/\/help\/get-help-now$/);
  });

  it("a click asking for a new tab is left to the browser", () => {
    wrap(<GetHelpNow country="GB" testId="me-get-help" />);
    const link = screen.getByTestId("me-get-help");
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link, { ctrlKey: true });
    expect(screen.queryByTestId("safety-card")).toBeNull();
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

describe("a number never breaks inside a digit group (#247; UX 12 Nov)", () => {
  it("one block with its brackets, whole where it fits; wider than the line, it wraps only between groups; plain spaces, and it still dials", () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><SafetyCard country="DE" onClose={() => {}} /></NextIntlClientProvider>);
    const link = screen.getByTestId("safety-call-helpline");
    const number = link.querySelector("[data-help-number]")!;
    // The block: "(", the number, ")"; it moves to the next line whole rather than splitting.
    expect(number.parentElement).toHaveClass("inline-block");
    expect(number.parentElement!.textContent).toBe("(0800 111 0 111)");
    // Each group can't break; only the spaces between them can.
    const groups = [...number.querySelectorAll("span")];
    expect(groups.map((g) => g.textContent)).toEqual(["0800", "111", "0", "111"]);
    for (const group of groups) expect(group).toHaveClass("whitespace-nowrap");
    expect(number.textContent).toBe("0800 111 0 111");
    expect(link.textContent).toContain("(0800 111 0 111)");
    expect(link.textContent).not.toContain(String.fromCharCode(160));
    expect(link).toHaveAttribute("href", "tel:08001110111");
  });

  it("the longest ones stop growing a size earlier", () => {
    for (const code of ["AR", "DE", "IT", "MX"]) expect(helpLineSize(helplinesFor(code).helpline!.display), code).toContain("28px");
    for (const code of ["BE", "FR", "GB"]) expect(helpLineSize(helplinesFor(code).helpline!.display), code).toContain("32px");
  });
});

describe("a line's hours are in the live languages", () => {
  it("every line with hours has them in en, fr, es and pt, and the card's lookup finds them", () => {
    const withHours = registry.countries.filter((c) => c.helpline?.hours);
    expect(withHours.map((c) => c.code)).toEqual(["AR", "LU"]);
    for (const { code, helpline } of withHours) {
      const hours = helpline!.hours as Record<string, string>;
      for (const [locale, data] of [["en", "en"], ["fr", "fr"], ["es", "es"], ["pt-br", "pt"]]) {
        expect(hours[data], `${code} ${data}`).toBeTruthy();
        expect(helplinesFor(code, locale).helpline?.hours, `${code} ${locale}`).toBe(hours[data]);
      }
    }
  });
});

describe("SafetyCard: My safety plan (1.2, the Reviewer's read)", () => {
  it("with content: the button, below the helplines, and it closes the card on the way", async () => {
    planHas = true;
    const onClose = vi.fn();
    wrap(<SafetyCard country="TH" onClose={onClose} />);
    const button = await screen.findByTestId("safety-plan-button");
    expect(button).toHaveTextContent(s.safetyPlanButton);
    expect(button).toHaveAttribute("href", "/app/me/safety-plan");
    for (const id of ["safety-call-helpline", "safety-call-emergency", "safety-find-helpline"]) {
      expect(screen.getByTestId(id).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING, id).toBeTruthy();
    }
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalled();
    planHas = false;
  });

  it("an empty plan: the card exactly as it was, no button", async () => {
    planHas = false;
    wrap(<SafetyCard country="TH" onClose={() => {}} />);
    await Promise.resolve();
    expect(screen.queryByTestId("safety-plan-button")).toBeNull();
  });

  it("help never waits on the plan: no answer yet, the helplines are already there", () => {
    planHas = "never";
    wrap(<SafetyCard country="TH" onClose={() => {}} />);
    expect(screen.getByTestId("safety-call-helpline")).toBeInTheDocument();
    expect(screen.queryByTestId("safety-plan-button")).toBeNull();
    planHas = false;
  });
});

describe("SafetyCard: a number to tap even with no profile country (UX, #269)", () => {
  const withRequest = (country: string | null, ui: React.ReactNode) => wrap(<RequestCountryProvider country={country}>{ui}</RequestCountryProvider>);

  it("the profile's country wins over the request's, and isn't named: it's theirs", () => {
    withRequest("NZ", <SafetyCard country="TH" onClose={() => {}} />);
    expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:1323");
    expect(screen.queryByTestId("safety-request-country")).toBeNull();
  });

  it("none: the request's country, named above its helpline and emergency number, at once", () => {
    withRequest("TH", <SafetyCard country={null} onClose={() => {}} />);
    expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:1323");
    expect(screen.getByTestId("safety-call-emergency")).toHaveAttribute("href", "tel:1669");
    const name = screen.getByTestId("safety-request-country");
    expect(name).toHaveTextContent("Thailand");
    expect(name.compareDocumentPosition(screen.getByTestId("safety-call-helpline")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("neither: the sentence and Find a helpline, as before", () => {
    withRequest(null, <SafetyCard country={null} onClose={() => {}} />);
    expect(screen.queryByTestId("safety-call-helpline")).toBeNull();
    expect(screen.getByTestId("safety-find-helpline")).toBeInTheDocument();
  });

  it("the header is used only as two letters", () => {
    expect([null, "", "th", "TH", "T1", "THA", "XX"].map(usableCountry)).toEqual([null, null, "TH", "TH", null, null, "XX"]);
  });
});

// The help card keeps the default colours whatever Plus palette is on (UX, 11 Nov):
// the palette CSS resets every token under [data-default-colours], so the overlay must carry it.
describe("SafetyCard: the default colours under any palette (#277)", () => {
  it("the help card's overlay carries data-default-colours", () => {
    wrap(<SafetyCard country="TH" onClose={() => {}} />);
    expect(screen.getByTestId("safety-card").closest("[data-default-colours]")).not.toBeNull();
  });

  it("another dialog doesn't: it takes the chosen palette", () => {
    wrap(
      <Dialog title={messages.me.meAppearance} onCancel={() => {}} testId="other-dialog">
        <button type="button">{messages.me.cancel}</button>
      </Dialog>,
    );
    expect(screen.getByTestId("other-dialog").closest("[data-default-colours]")).toBeNull();
  });
});

// Today's standing help (UX & PM, 13 Nov; specs/1.2-features.md): a lifebuoy named with the
// existing words, the same destination as Me's, quiet, 48 px.
describe("Get help now as Today's lifebuoy (icon)", () => {
  it("named and titled with the same words in each language, no new copy, and the picture hidden", () => {
    for (const [locale, m] of [["en", messages], ["fr", fr], ["es", es], ["pt-br", ptBr]] as const) {
      const { unmount } = render(
        <NextIntlClientProvider locale={locale} messages={m}>
          <GetHelpNow country="GB" testId="today-help" neutral icon />
        </NextIntlClientProvider>,
      );
      const link = screen.getByTestId("today-help");
      expect(link).toHaveAccessibleName(m.me.meGetHelpNow);
      expect(link).toHaveAttribute("title", m.me.meGetHelpNow);
      expect(link.textContent).toBe("");
      expect(screen.getByTestId("lifebuoy-icon")).toHaveAttribute("aria-hidden", "true");
      unmount();
    }
  });

  it("the same destination as Me's: the help page with no scripts, the neutral card with them, focus back after", () => {
    wrap(<GetHelpNow country="TH" testId="today-help" neutral icon />);
    const link = screen.getByTestId("today-help");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toMatch(/\/help\/get-help-now$/);
    link.focus();
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByTestId("safety-card")).toHaveTextContent(s.safetyBodyNeutral);
    expect(screen.getByTestId("safety-call-helpline")).toHaveTextContent("1323");
    fireEvent.click(screen.getByTestId("safety-close"));
    expect(screen.queryByTestId("safety-card")).toBeNull();
    expect(link).toHaveFocus();
  });

  it("a click asking for a new tab is left to the browser", () => {
    wrap(<GetHelpNow country="GB" testId="today-help" neutral icon />);
    const link = screen.getByTestId("today-help");
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link, { ctrlKey: true });
    expect(screen.queryByTestId("safety-card")).toBeNull();
  });

  it("quiet and a fixed 48 px: no accent, no border, no banner colour; px, so large text doesn't grow it", () => {
    wrap(<GetHelpNow country="GB" testId="today-help" neutral icon />);
    const link = screen.getByTestId("today-help");
    expect(link.className).toContain("h-[48px]");
    expect(link.className).toContain("w-[48px]");
    expect(link.className).toContain("shrink-0");
    expect(link.className).toContain("text-muted");
    expect(link.className).not.toMatch(/bg-accent|text-accent|border|bg-danger|text-danger|red/);
  });
});
