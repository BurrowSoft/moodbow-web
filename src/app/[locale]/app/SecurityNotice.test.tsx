import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { SecurityNotice } = await import("./SecurityNotice");

const show = (id = "n1", uid = "u1") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SecurityNotice id={id} uid={uid} />
    </NextIntlClientProvider>,
  );

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("SecurityNotice", () => {
  it("not read: the words and a link to the public page", () => {
    show();
    expect(screen.getByTestId("security-notice")).toHaveTextContent(messages.common.securityNotice);
    expect(screen.getByTestId("security-notice-read")).toHaveAttribute("href", "/security");
    expect(screen.getByTestId("security-notice-read")).toHaveTextContent(messages.common.securityNoticeRead);
  });
  it("read: gone, and stays gone", () => {
    show();
    fireEvent.click(screen.getByTestId("security-notice-read"));
    expect(screen.queryByTestId("security-notice")).toBeNull();
    cleanup();
    show();
    expect(screen.queryByTestId("security-notice")).toBeNull();
  });
  it("a new update shows again, and so does another person on this browser", () => {
    show();
    fireEvent.click(screen.getByTestId("security-notice-read"));
    cleanup();
    show("n2");
    expect(screen.getByTestId("security-notice")).toBeInTheDocument();
    cleanup();
    show("n1", "u2");
    expect(screen.getByTestId("security-notice")).toBeInTheDocument();
  });
  it("storage blocked: it shows, and following it still works", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    expect(screen.getByTestId("security-notice")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("security-notice-read"));
    expect(screen.queryByTestId("security-notice")).toBeNull();
    get.mockRestore();
    set.mockRestore();
  });
});
