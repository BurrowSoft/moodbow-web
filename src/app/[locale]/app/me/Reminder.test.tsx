import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const saveReminder = vi.fn();
vi.mock("./actions", () => ({ saveReminder: (...a: unknown[]) => saveReminder(...a) }));
const { Reminder } = await import("./Reminder");

const renderIt = (on = true, time = "21:00") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Reminder on={on} time={time} />
    </NextIntlClientProvider>,
  );
const sent = (i = 0) => Object.fromEntries((saveReminder.mock.calls[i][1] as FormData).entries());

beforeEach(() => {
  saveReminder.mockReset();
  saveReminder.mockImplementation(async (_p: unknown, f: FormData) => ({ status: "saved", on: f.get("reminder_on") === "true", time: f.get("reminder_time") }));
});
afterEach(cleanup);

describe("Reminder", () => {
  it("says the reminder arrives on the phone (web-only note)", () => {
    renderIt();
    expect(screen.getByTestId("me-reminder-note")).toHaveTextContent(messages.me.webReminderNote);
  });

  it("turning it off saves at once and disables the time", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("switch", { name: messages.me.meReminder }));
    await waitFor(() => expect(saveReminder).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ reminder_on: "false", reminder_time: "21:00" });
    expect(screen.getByTestId("me-reminder-time")).toBeDisabled();
    expect(await screen.findByText(messages.today.checkinSaved)).toBeInTheDocument();
  });

  it("a new time saves when leaving the field; leaving it unchanged sends nothing", async () => {
    renderIt(true, "21:00");
    const field = screen.getByLabelText(messages.me.meReminderTime);
    fireEvent.blur(field);
    expect(saveReminder).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "07:15" } });
    fireEvent.blur(field);
    await waitFor(() => expect(saveReminder).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ reminder_on: "true", reminder_time: "07:15" });
    fireEvent.blur(field);
    expect(saveReminder).toHaveBeenCalledTimes(1);
  });

  it("a failure says so", async () => {
    saveReminder.mockResolvedValue({ status: "error", on: false, time: "21:00" });
    renderIt();
    fireEvent.click(screen.getByTestId("me-reminder-on"));
    expect(await screen.findByText(messages.today.errGeneric)).toBeInTheDocument();
  });
});

describe("Reminder: a failed save shows what the account has (decision 111)", () => {
  const fail = async (_p: unknown, f: FormData) => ({ status: "error", on: f.get("reminder_on") === "true", time: f.get("reminder_time") });

  it("the switch goes back on; Try again resends the change", async () => {
    saveReminder.mockImplementationOnce(fail);
    renderIt(true, "21:00");
    const sw = screen.getByTestId("me-reminder-on");
    fireEvent.click(sw);
    expect(await screen.findByText(messages.today.errGeneric)).toBeInTheDocument();
    expect(sw).toBeChecked();
    expect(screen.getByTestId("me-reminder-time")).toBeEnabled();

    fireEvent.click(screen.getByTestId("me-reminder-retry"));
    expect(await screen.findByText(messages.today.checkinSaved)).toBeInTheDocument();
    expect(sent(1)).toEqual({ reminder_on: "false", reminder_time: "21:00" });
    expect(sw).not.toBeChecked();
    expect(screen.queryByTestId("me-reminder-retry")).toBeNull();
  });

  it("a thrown save (network off) also reverts", async () => {
    saveReminder.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderIt(false, "21:00");
    fireEvent.click(screen.getByTestId("me-reminder-on"));
    expect(await screen.findByTestId("me-reminder-retry")).toBeInTheDocument();
    expect(screen.getByTestId("me-reminder-on")).not.toBeChecked();
  });

  it("a failed time goes back to the saved time, and only a later success moves it", async () => {
    renderIt(true, "21:00");
    const field = screen.getByTestId("me-reminder-time");
    fireEvent.change(field, { target: { value: "07:30" } });
    fireEvent.blur(field);
    expect(await screen.findByText(messages.today.checkinSaved)).toBeInTheDocument();
    saveReminder.mockImplementationOnce(fail);
    fireEvent.change(field, { target: { value: "06:00" } });
    fireEvent.blur(field);
    expect(await screen.findByText(messages.today.errGeneric)).toBeInTheDocument();
    expect(field).toHaveValue("07:30");
    // Leaving it at the saved time again sends nothing.
    fireEvent.blur(field);
    expect(saveReminder).toHaveBeenCalledTimes(2);
  });
});

describe("Reminder: a switch row that waits for its save (decision 206)", () => {
  it("while the switch's save runs, the switch and the time wait; a second click sends nothing", async () => {
    let answer: (v: unknown) => void = () => {};
    saveReminder.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    renderIt(true, "21:00");
    const sw = screen.getByRole("switch", { name: messages.me.meReminder });
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByTestId("me-reminder-time")).toBeDisabled();
    fireEvent.click(sw);
    expect(saveReminder).toHaveBeenCalledTimes(1);
    answer({ status: "saved", on: false, time: "21:00" });
    await waitFor(() => expect(sw).not.toHaveAttribute("aria-disabled"));
    expect(sw).not.toBeChecked();
  });

  it("a time saved on leaving the field doesn't block the switch", async () => {
    let answer: (v: unknown) => void = () => {};
    saveReminder.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    renderIt(true, "21:00");
    const field = screen.getByTestId("me-reminder-time");
    fireEvent.change(field, { target: { value: "06:45" } });
    fireEvent.blur(field);
    await waitFor(() => expect(saveReminder).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("me-reminder-on")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getByTestId("me-reminder-on"));
    answer({ status: "saved", on: true, time: "06:45" });
    await waitFor(() => expect(saveReminder).toHaveBeenCalledTimes(2));
    expect(sent(1)).toEqual({ reminder_on: "false", reminder_time: "06:45" });
  });
});

describe("Reminder: a new time, then switching off before leaving the field (reviewer #19)", () => {
  it("sends the new time with the switch", async () => {
    renderIt(true, "21:00");
    fireEvent.change(screen.getByTestId("me-reminder-time"), { target: { value: "06:45" } });
    fireEvent.click(screen.getByTestId("me-reminder-on"));
    await waitFor(() => expect(saveReminder).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ reminder_on: "false", reminder_time: "06:45" });
    // The field, now disabled, doesn't send it again when left.
    fireEvent.blur(screen.getByTestId("me-reminder-time"));
    expect(saveReminder).toHaveBeenCalledTimes(1);
  });
});
