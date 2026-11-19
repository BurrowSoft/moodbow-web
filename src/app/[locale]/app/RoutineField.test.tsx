import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const { RoutineField, RoutineSummary, sameTicks } = await import("./RoutineField");

const m = messages.routine;
const items = [
  { id: "a", name: "Morning meds" },
  { id: "b", name: "Walk outside" },
];
afterEach(cleanup);
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{node}</NextIntlClientProvider>);

describe("Routine in the check-in (1.4 F, board 29)", () => {
  it("each item a toggle; a tap ticks or unticks it", () => {
    const onChange = vi.fn();
    wrap(<RoutineField items={items} ticks={["a"]} onChange={onChange} />);
    const [meds, walk] = screen.getAllByTestId("checkin-routine-item");
    expect(meds).toHaveAttribute("aria-pressed", "true");
    expect(walk).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(walk);
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(meds);
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole("group")).toHaveAccessibleName(`${m.rowTitle} ${messages.today.optional}`);
  });

  it("no items: the app's line and Set up to Me → Routine", () => {
    wrap(<RoutineField items={[]} ticks={[]} onChange={() => undefined} />);
    expect(screen.getByTestId("checkin-routine-empty")).toHaveTextContent(m.rowEmpty);
    expect(screen.getByTestId("checkin-routine-setup")).toHaveAttribute("href", "/app/me/routine");
  });

  it("the saved card lists only the ticked ones, in order; none, nothing", () => {
    wrap(<RoutineSummary items={items} ticks={["b", "a"]} />);
    expect(screen.getByTestId("checkin-summary-routine")).toHaveTextContent("Morning medsWalk outside");
    cleanup();
    wrap(<RoutineSummary items={items} ticks={[]} />);
    expect(screen.queryByTestId("checkin-summary-routine")).toBeNull();
  });

  it("the same ticks in any order", () => {
    expect(sameTicks(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameTicks(["a"], ["a", "b"])).toBe(false);
  });
});
