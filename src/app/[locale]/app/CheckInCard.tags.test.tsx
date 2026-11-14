import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import type { CheckIn } from "@/lib/journal/checkIn";

// The check-in card with tags (UX, 11 Nov), against a mocked save action.
const saveCheckIn = vi.fn();
vi.mock("./actions", () => ({ saveCheckIn: (...args: unknown[]) => saveCheckIn(...args) }));
vi.mock("@/lib/ui/withTimeout", async (orig) => ({ ...(await orig<typeof import("@/lib/ui/withTimeout")>()), SAVE_WAIT_MS: 300 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { CheckInCard } = await import("./CheckInCard");

const ROW: CheckIn = { local_date: "2026-10-02", mood: 4, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null, updated_at: "2026-10-02T10:00:00Z" };
const show = (initialTags: string[] | null, recentTags: string[] = [], country: string | null = null) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CheckInCard initial={ROW} uid="u1" date="2026-10-02" dateLocaleTag="en-US" initialTags={initialTags} recentTags={recentTags} country={country} />
    </NextIntlClientProvider>,
  );
const sent = (call = 0) => Object.fromEntries((saveCheckIn.mock.calls[call][1] as FormData).entries());
const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
const addTag = (tag: string) => {
  fireEvent.change(screen.getByTestId("checkin-tags-input"), { target: { value: tag } });
  fireEvent.keyDown(screen.getByTestId("checkin-tags-input"), { key: "Enter" });
};
const edit = () => fireEvent.click(screen.getByTestId("checkin-edit"));
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("checkin-save"));
  });
};

beforeEach(() => {
  saveCheckIn.mockReset();
  window.localStorage.clear();
  setOnline(true);
});
afterEach(cleanup);

describe("CheckInCard with tags", () => {
  it("tags off here (null): no field, nothing about tags sent", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW });
    show(null);
    edit();
    expect(screen.queryByTestId("checkin-tags")).toBeNull();
    await save();
    expect(sent()).not.toHaveProperty("tags");
  });

  it("the day's tags in the summary; unchanged, they aren't sent again", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW });
    show(["Walk"]);
    expect(screen.getByTestId("checkin-summary-tags")).toHaveTextContent("Walk");
    edit();
    await save();
    expect(sent()).not.toHaveProperty("tags");
  });

  it("changed: sent with the check-in, and the saved ones shown", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW, tags: ["Walk", "Rain"] });
    show(["Walk"]);
    edit();
    addTag("Rain");
    await save();
    expect(JSON.parse(String(sent().tags))).toEqual(["Walk", "Rain"]);
    await waitFor(() => expect(screen.getByTestId("checkin-summary-tags")).toHaveTextContent("Rain"));
  });

  it("the check-in saved but the tags weren't: said, not hidden", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW, tagsSaved: false });
    show([]);
    edit();
    addTag("Rain");
    await save();
    expect(await screen.findByTestId("checkin-tags-failed")).toHaveTextContent(messages.today.errGeneric);
  });

  it("a tag the crisis list matches: the help card opens, and the save still goes (UX)", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW, tags: [] });
    show([]);
    edit();
    addTag(CRISIS_KEYWORDS!.languages.en.phrases[0].slice(0, 32));
    await save();
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(saveCheckIn).toHaveBeenCalled();
  });

  it("the help card has the profile's country's numbers, as the editor's does (the Reviewer, #278)", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW, tags: [] });
    show([], [], "TH");
    edit();
    addTag(CRISIS_KEYWORDS!.languages.en.phrases[0].slice(0, 32));
    await save();
    expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:1323");
  });

  it("a near miss: no help card", async () => {
    saveCheckIn.mockResolvedValue({ status: "saved", checkIn: ROW, tags: [] });
    show([]);
    edit();
    addTag("killer workout");
    await save();
    expect(screen.queryByTestId("safety-card")).toBeNull();
  });

  it("offline: the copy keeps the changed tags, so they sync with it", async () => {
    setOnline(false);
    show([]);
    edit();
    addTag("Rain");
    await save();
    const copy = JSON.parse(window.localStorage.getItem("mb:pending-checkin:u1:2026-10-02")!);
    expect(copy.tags).toEqual(["Rain"]);
  });
});
