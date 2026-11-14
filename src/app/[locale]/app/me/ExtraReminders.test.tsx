import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Me → Daily reminder's more reminders (Plus, specs/plus-more-reminders.md, UX 12 Nov).
const saveReminder = vi.fn();
const saveExtraReminders = vi.fn();
vi.mock("./actions", () => ({ saveReminder: (...a: unknown[]) => saveReminder(...a), saveExtraReminders: (...a: unknown[]) => saveExtraReminders(...a) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
const { Reminder } = await import("./Reminder");
const { timeLabel } = await import("./ExtraReminders");
const removeName = (hhmm: string) => messages.me.reminderRemoveTime.replace("{time}", timeLabel(hhmm, "en"));

type Extra = Parameters<typeof Reminder>[0]["extra"];
const PLUS: Extra = { mode: { kind: "plus" }, times: [] };
const renderIt = (extra: Extra, on = true, time = "21:00") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Reminder on={on} time={time} extra={extra} />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  saveReminder.mockReset();
  saveExtraReminders.mockReset();
  saveExtraReminders.mockImplementation(async (times: string[]) => ({ ok: true, times: [...times].sort() }));
});
afterEach(cleanup);

describe("more reminders: with Plus", () => {
  it("Add another time, a time, saved as the whole list", async () => {
    renderIt(PLUS);
    fireEvent.click(screen.getByRole("button", { name: messages.me.reminderAddTime }));
    const field = screen.getByTestId("me-reminder-extra-new");
    fireEvent.change(field, { target: { value: "08:00" } });
    fireEvent.blur(field);
    await waitFor(() => expect(saveExtraReminders).toHaveBeenCalledWith(["08:00"]));
    expect(await screen.findByText(messages.today.checkinSaved)).toBeInTheDocument();
    expect(screen.getAllByTestId("me-reminder-extra-time")).toHaveLength(1);
  });

  it("an hour from every other time, checked before sending", async () => {
    renderIt(PLUS);
    fireEvent.click(screen.getByTestId("me-reminder-extra-add"));
    const field = screen.getByTestId("me-reminder-extra-new");
    fireEvent.change(field, { target: { value: "20:30" } });
    fireEvent.blur(field);
    expect(await screen.findByText(messages.me.reminderTooClose)).toBeInTheDocument();
    expect(saveExtraReminders).not.toHaveBeenCalled();
  });

  it("at 2 more, no Add: the limit is said instead", () => {
    renderIt({ mode: { kind: "plus" }, times: ["08:00", "13:00"] });
    expect(screen.queryByTestId("me-reminder-extra-add")).toBeNull();
    expect(screen.getByTestId("me-reminder-extra-max")).toHaveTextContent(messages.me.reminderMax);
  });

  it("Remove sends the list without that time", async () => {
    renderIt({ mode: { kind: "plus" }, times: ["08:00", "13:00"] });
    fireEvent.click(screen.getByRole("button", { name: removeName("08:00") }));
    await waitFor(() => expect(saveExtraReminders).toHaveBeenCalledWith(["13:00"]));
  });

  // UX: a screen reader never hears several bare "Remove"s.
  it("each Remove is named with its own time, and no two controls share a name", () => {
    renderIt({ mode: { kind: "plus" }, times: ["08:00", "13:00"] });
    const removes = screen.getAllByTestId("me-reminder-extra-remove");
    expect(removes.map((b) => b.getAttribute("aria-label"))).toEqual([removeName("08:00"), removeName("13:00")]);
    expect(screen.queryByRole("button", { name: messages.me.reminderRemove })).toBeNull();
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the server's refusal says why and keeps the account's list", async () => {
    saveExtraReminders.mockResolvedValue({ ok: false, error: "too_close" });
    renderIt({ mode: { kind: "plus" }, times: ["08:00"] });
    const field = screen.getByTestId("me-reminder-extra-time");
    fireEvent.change(field, { target: { value: "10:00" } });
    fireEvent.blur(field);
    expect(await screen.findByText(messages.me.reminderTooClose)).toBeInTheDocument();
    expect(screen.getByTestId("me-reminder-extra-time")).toHaveValue("08:00");
  });

  it("the main switch off: the times and Add wait", () => {
    renderIt({ mode: { kind: "plus" }, times: ["08:00"] }, false);
    expect(screen.getByTestId("me-reminder-extra-time")).toBeDisabled();
    expect(screen.getByTestId("me-reminder-extra-add")).toBeDisabled();
  });

  it("a new main time that removed one says so, once, by its time", async () => {
    saveReminder.mockResolvedValue({ status: "saved", on: true, time: "20:00", extra: ["08:00"] });
    renderIt({ mode: { kind: "plus" }, times: ["08:00", "20:30"] });
    const main = screen.getByLabelText(messages.me.meReminderTime);
    fireEvent.change(main, { target: { value: "20:00" } });
    fireEvent.blur(main);
    const removed = await screen.findByTestId("me-reminder-extra-removed");
    expect(removed).toHaveTextContent(messages.me.reminderExtraRemoved.split("{time}")[0].trim());
    expect(removed.querySelectorAll("li")).toHaveLength(1);
    expect(removed).toHaveTextContent("8:30");
    expect(screen.getAllByTestId("me-reminder-extra-time")).toHaveLength(1);
  });
});

describe("more reminders: without Plus", () => {
  const LOCKED: Extra = { mode: { kind: "locked", offer: { trial: true, price: "US$59.99" } }, times: [] };

  // The Plus sheet is retired since #315: the lock is a link to the Plus screen.
  it("Add another time is the lock: a link to the Plus screen, only here", () => {
    renderIt(LOCKED);
    expect(screen.queryByTestId("me-reminder-extra-add")).toBeNull();
    expect(screen.getByTestId("me-reminder-extra-add-locked")).toHaveAttribute("href", "/app/me/plus");
    expect(saveExtraReminders).not.toHaveBeenCalled();
  });

  it("times kept from an earlier Plus stay listed, locked, and can be removed", async () => {
    renderIt({ ...LOCKED!, times: ["08:00"] });
    expect(screen.queryByTestId("me-reminder-extra-time")).toBeNull();
    expect(screen.getByTestId("me-reminder-extra-locked")).toHaveTextContent("8:00");
    fireEvent.click(screen.getByRole("button", { name: removeName("08:00") }));
    await waitFor(() => expect(saveExtraReminders).toHaveBeenCalledWith([]));
  });

  it("nothing at all where Plus isn't shown", () => {
    renderIt(null);
    expect(screen.queryByTestId("me-reminder-extra")).toBeNull();
  });
});
