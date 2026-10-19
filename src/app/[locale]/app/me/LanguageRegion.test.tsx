import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const saveRegion = vi.fn();
vi.mock("./actions", () => ({ saveRegion: (...a: unknown[]) => saveRegion(...a) }));
const refresh = vi.fn();
const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh, replace }), usePathname: () => "/app/me" }));
const { LanguageRegion } = await import("./LanguageRegion");
const { countryOptions, languageOptions, timeZoneOptions } = await import("@/lib/region/countries");

const renderIt = (initial = { locale: "en", country: "TH", time_zone: "Asia/Bangkok" }) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LanguageRegion initial={initial} countries={countryOptions("en")} zones={timeZoneOptions(initial.time_zone)} languages={languageOptions(["en"])} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  saveRegion.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
  replace.mockReset();
});
afterEach(cleanup);

describe("Me → Language & region", () => {
  it("shows the profile's values; every ISO country plus Not set; one language for now", () => {
    renderIt();
    expect(screen.getByTestId("me-country")).toHaveValue("TH");
    expect(screen.getByTestId("me-time-zone")).toHaveValue("Asia/Bangkok");
    expect(screen.getByTestId("me-country").querySelectorAll("option")).toHaveLength(250);
    expect(screen.getByRole("option", { name: messages.me.meCountryNone })).toHaveValue("");
    expect(screen.getByTestId("me-language")).toBeDisabled();
    expect(screen.getByTestId("me-language")).toHaveDisplayValue("English");
  });

  it("country saves on change; Not set saves an empty country", async () => {
    renderIt();
    fireEvent.change(screen.getByTestId("me-country"), { target: { value: "US" } });
    await waitFor(() => expect(saveRegion).toHaveBeenCalledWith("country", "US"));
    await waitFor(() => expect(screen.getByTestId("me-country")).toBeEnabled());
    fireEvent.change(screen.getByTestId("me-country"), { target: { value: "" } });
    await waitFor(() => expect(saveRegion).toHaveBeenLastCalledWith("country", ""));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a new time zone saves and refreshes the page (today depends on it)", async () => {
    renderIt();
    fireEvent.change(screen.getByTestId("me-time-zone"), { target: { value: "UTC" } });
    await waitFor(() => expect(saveRegion).toHaveBeenCalledWith("time_zone", "UTC"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("a failed save goes back to what the account has; Try again resends it (decision 111)", async () => {
    saveRegion.mockResolvedValueOnce({ ok: false });
    renderIt();
    fireEvent.change(screen.getByTestId("me-country"), { target: { value: "US" } });
    expect(await screen.findByTestId("me-region-error")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getByTestId("me-country")).toHaveValue("TH");
    fireEvent.click(screen.getByTestId("me-region-retry"));
    await waitFor(() => expect(screen.getByTestId("me-country")).toHaveValue("US"));
    expect(saveRegion).toHaveBeenCalledTimes(2);
  });

  it("a thrown save (network off) also reverts", async () => {
    saveRegion.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderIt();
    fireEvent.change(screen.getByTestId("me-time-zone"), { target: { value: "UTC" } });
    expect(await screen.findByTestId("me-region-retry")).toBeInTheDocument();
    expect(screen.getByTestId("me-time-zone")).toHaveValue("Asia/Bangkok");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("Me → Language & region: the lists come from the server (reviewer #36)", () => {
  it("renders exactly the options it's given (no browser-side Intl lists)", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LanguageRegion initial={{ locale: "en", country: "TH", time_zone: "Asia/Bangkok" }} countries={[["TH", "Thailand"], ["US", "United States"]]} zones={["Asia/Bangkok", "UTC"]} languages={[["en", "English"]]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("me-country").querySelectorAll("option")).toHaveLength(3);
    expect(screen.getByTestId("me-time-zone").querySelectorAll("option")).toHaveLength(2);
  });
});
