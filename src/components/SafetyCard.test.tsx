import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { helplinesFor, telHref } from "@/lib/safety/helplines";
import { GetHelpNow, SafetyCard } from "./SafetyCard";

// The safety card (M8, decision 124) and its numbers from countries.json.
const s = messages.safety;
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
afterEach(cleanup);

describe("helplinesFor", () => {
  it("a listed country: its helpline and emergency number, verified or not (TH ships as listed)", () => {
    expect(helplinesFor("TH")).toMatchObject({ helpline: { name: "Department of Mental Health hotline", display: "1323", dial: "1323" }, emergency: { dial: "1669" } });
    expect(helplinesFor("us").helpline).not.toBeNull();
  });
  it("unknown or none: only the directory", () => {
    expect(helplinesFor("ZZ")).toEqual({ helpline: null, emergency: null, directoryUrl: "https://findahelpline.com" });
    expect(helplinesFor(null).helpline).toBeNull();
  });
  it("tel: links carry digits only", () => {
    expect(telHref("0800 111 0 111")).toBe("tel:08001110111");
    expect(telHref("+44 116 123")).toBe("tel:+44116123");
  });
});

describe("SafetyCard", () => {
  it("focus on the title; the helpline and emergency number as tel: links; not-therapy line", () => {
    wrap(<SafetyCard country="TH" onClose={() => {}} />);
    const card = screen.getByTestId("safety-card");
    expect(screen.getByRole("heading", { name: s.safetyTitle })).toHaveFocus();
    expect(card).toHaveTextContent(s.safetyBody);
    expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:1323");
    expect(screen.getByTestId("safety-call-helpline")).toHaveTextContent("Call Department of Mental Health hotline (1323)");
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

  it("Close and Esc close it", () => {
    const onClose = vi.fn();
    wrap(<SafetyCard country="GB" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("safety-close"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
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

describe("SafetyCard: numbers as plain text too (decision 142) and the new-tab cue", () => {
  it("each number is also selectable text beside its link (not read twice); Find a helpline says it opens a new tab", () => {
    wrap(<SafetyCard country="TH" onClose={() => {}} />);
    expect(screen.getByTestId("safety-number-helpline")).toHaveTextContent("1323");
    expect(screen.getByTestId("safety-number-helpline")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("safety-number-emergency")).toHaveTextContent("1669");
    expect(screen.getByTestId("safety-find-helpline")).toHaveAccessibleName(`${s.safetyFindHelpline} ${messages.common.opensInNewTab}`);
  });
});
