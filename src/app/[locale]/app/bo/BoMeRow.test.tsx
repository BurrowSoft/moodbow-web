import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { BoMeRow } from "./BoMeRow";

const reads = vi.fn(async (_on: boolean) => ({ ok: true }));
const clear = vi.fn(async () => ({ ok: true }));
vi.mock("./actions", () => ({ setBoReadsJournal: (on: boolean) => reads(on), clearBoConversation: () => clear() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const b = messages.bo;
const open = (props: Partial<React.ComponentProps<typeof BoMeRow>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoMeRow hasConversation readsJournal={false} consented {...props} />
    </NextIntlClientProvider>,
  );

describe("BoMeRow", () => {
  it("with a conversation: Export and Clear; empty: says so, with neither", () => {
    open();
    expect(screen.getByTestId("me-bo")).toHaveTextContent(b.meRow);
    expect(screen.getByTestId("me-bo-export")).toHaveTextContent(messages.me.meExport);
    expect(screen.getByTestId("me-bo-clear")).toHaveTextContent(b.clearAction);
    cleanup();
    open({ hasConversation: false });
    expect(screen.getByTestId("me-bo-empty")).toHaveTextContent(b.meRowEmpty);
    expect(screen.queryByTestId("me-bo-clear")).toBeNull();
  });

  it("the journal switch is off by default and saves; a failed save goes back and says so; none without consent", async () => {
    open();
    const box = screen.getByTestId("me-bo-journal");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await act(async () => {});
    expect(reads).toHaveBeenCalledWith(true);
    expect(box).toBeChecked();
    reads.mockResolvedValueOnce({ ok: false });
    fireEvent.click(box);
    await act(async () => {});
    expect(box).toBeChecked();
    expect(screen.getByTestId("me-bo-failed")).toBeInTheDocument();
    cleanup();
    open({ consented: false });
    expect(screen.queryByTestId("me-bo-journal")).toBeNull();
  });

  it("Clear asks first, opens on Cancel, and Cancel clears nothing", () => {
    open();
    fireEvent.click(screen.getByTestId("me-bo-clear"));
    expect(screen.getByTestId("bo-clear-dialog")).toHaveTextContent(b.clearBody);
    expect(screen.getByTestId("bo-clear-cancel")).toHaveFocus();
    fireEvent.click(screen.getByTestId("bo-clear-cancel"));
    expect(clear).not.toHaveBeenCalled();
    expect(screen.queryByTestId("bo-clear-dialog")).toBeNull();
  });

  it("a confirmed Clear empties the row; a failed one stays and says so", async () => {
    open();
    fireEvent.click(screen.getByTestId("me-bo-clear"));
    clear.mockResolvedValueOnce({ ok: false });
    fireEvent.click(screen.getByTestId("bo-clear-confirm"));
    await act(async () => {});
    expect(screen.getByTestId("bo-clear-failed")).toHaveTextContent(b.consentFailed);
    fireEvent.click(screen.getByTestId("bo-clear-confirm"));
    await act(async () => {});
    expect(screen.queryByTestId("bo-clear-dialog")).toBeNull();
    expect(screen.getByTestId("me-bo-empty")).toBeInTheDocument();
  });
});
