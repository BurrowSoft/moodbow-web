import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// Today's share notes (1.4 G, the coercion defence): each says where to stop the link, "See links"
// opens Me → Share, and "Got it" records the seen in the database (share_mark_seen).
const markShareSeen = vi.fn(async () => true);
vi.mock("./me/share/actions", () => ({ markShareSeen: (...a: unknown[]) => markShareSeen(...(a as [])) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { ShareNotes } = await import("./ShareNotes");
afterEach(cleanup);

describe("ShareNotes", () => {
  it("both notes, each with See links and Got it; Got it marks it seen and hides it", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ShareNotes
          notes={[
            { kind: "created", id: "a" },
            { kind: "first_view", id: "b" },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("share-note-created").textContent).toContain(messages.shareMe.noteCreated);
    expect(screen.getByTestId("share-note-first_view").textContent).toContain(messages.shareMe.noteFirstView);
    expect(screen.getByTestId("share-note-created-see").getAttribute("href")).toBe("/app/me/share");
    await act(async () => fireEvent.click(screen.getByTestId("share-note-created-ok")));
    expect(markShareSeen).toHaveBeenCalledWith("a", "created");
    expect(screen.queryByTestId("share-note-created")).toBeNull();
    expect(screen.getByTestId("share-note-first_view")).toBeTruthy();
  });

  it("no notes: nothing", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ShareNotes notes={[]} />
      </NextIntlClientProvider>,
    );
    expect(container.textContent).toBe("");
  });
});
