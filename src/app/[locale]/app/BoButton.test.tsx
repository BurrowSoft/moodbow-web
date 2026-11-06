import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

let path = "/app";
let keyboard = false;
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => path,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/ui/keyboardOpen", () => ({ useKeyboardOpen: () => keyboard }));
const { BoButton } = await import("./BoButton");

const button = () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoButton />
    </NextIntlClientProvider>,
  );
  return screen.queryByTestId("bo-button");
};

beforeEach(() => {
  path = "/app";
  keyboard = false;
});
afterEach(cleanup);

describe("BoButton", () => {
  it.each(["/app", "/app/timeline", "/app/insights", "/app/me"])("%s: shown, leading to Bo", (p) => {
    path = p;
    expect(button()).toHaveAttribute("href", "/app/bo");
  });

  it.each(["/app/write", "/app/bo", "/app/entries/x", "/app/timeline/2026-11-06", "/app/print/2026-11"])("%s: not at the top level, so not shown", (p) => {
    path = p;
    expect(button()).toBeNull();
  });

  it("out of the way while the on-screen keyboard is up", () => {
    keyboard = true;
    expect(button()).toBeNull();
  });
});
