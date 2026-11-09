import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { EMPTY_PLAN, type SafetyPlan } from "@/lib/journal/safetyPlan";

const saveText = vi.fn();
const addPerson = vi.fn();
const updatePerson = vi.fn();
const deletePerson = vi.fn();
vi.mock("./actions", () => ({
  saveSafetyPlanText: (...a: unknown[]) => saveText(...a),
  addSafetyPlanPerson: (...a: unknown[]) => addPerson(...a),
  updateSafetyPlanPerson: (...a: unknown[]) => updatePerson(...a),
  deleteSafetyPlanPerson: (...a: unknown[]) => deletePerson(...a),
}));
vi.mock("../toolbox/actions", () => ({ addToolboxItem: vi.fn(), updateToolboxItem: vi.fn(), deleteToolboxItem: vi.fn(), moveToolboxItem: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const { SafetyPlanEditor } = await import("./SafetyPlanEditor");

const p = messages.safetyPlan;
const ok = (plan: SafetyPlan) => Promise.resolve({ status: "ok", plan });
const sam = { id: "a", section: "people" as const, name: "Sam", phone: "+64 21 555 0100", position: 0 };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const open = (plan: SafetyPlan = EMPTY_PLAN, country: string | null = "NZ") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SafetyPlanEditor initial={plan} toolbox={[{ id: "t", text: "Walk round the block", position: 0 }]} country={country} />
    </NextIntlClientProvider>,
  );

describe("SafetyPlanEditor", () => {
  it("six parts in the standard order; section 2 is the toolbox list itself", () => {
    open();
    expect(screen.getByTestId("plan-intro")).toHaveTextContent(p.intro);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([p.warningSigns, messages.toolbox.meRow, p.distractions, p.people, p.professionals, p.surroundings]);
    expect(screen.getByTestId("toolbox-item")).toHaveTextContent("Walk round the block");
  });

  it("a text part saves with its own Save, and says Saved.", async () => {
    saveText.mockReturnValueOnce(ok({ ...EMPTY_PLAN, warning_signs: "Not sleeping" }));
    open();
    expect(screen.getByTestId("plan-warning_signs-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("plan-warning_signs-text"), { target: { value: "Not sleeping" } });
    await act(async () => fireEvent.click(screen.getByTestId("plan-warning_signs-save")));
    expect(saveText).toHaveBeenCalledWith("warning_signs", "Not sleeping");
    expect(screen.getByTestId("plan-warning_signs-saved")).toHaveTextContent(p.saved);
    expect(screen.getByTestId("plan-warning_signs-save")).toBeDisabled();
  });

  it("leaving with unsaved text asks first: Keep editing stays, Leave goes", () => {
    open();
    const away = document.createElement("a");
    away.href = "/app/me";
    away.textContent = "Back";
    document.body.append(away);
    fireEvent.change(screen.getByTestId("plan-surroundings-text"), { target: { value: "Ask Sam to keep" } });
    fireEvent.click(away);
    expect(screen.getByTestId("plan-leave")).toHaveAccessibleName(p.leaveTitle);
    fireEvent.click(screen.getByTestId("plan-keep-editing"));
    expect(screen.queryByTestId("plan-leave")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(away);
    fireEvent.click(screen.getByTestId("plan-leave-anyway"));
    expect(push).toHaveBeenCalledWith("/app/me");
    away.remove();
  });

  it("nothing unsaved: links go as usual", () => {
    open();
    const away = document.createElement("a");
    away.href = "/app/me";
    document.body.append(away);
    fireEvent.click(away);
    expect(screen.queryByTestId("plan-leave")).toBeNull();
    away.remove();
  });

  it("a person with a number: Call, a tel: link; without one, no Call", () => {
    open({ ...EMPTY_PLAN, people: [sam, { id: "b", section: "people", name: "Alex", phone: null, position: 1 }] });
    const [withNumber, without] = screen.getAllByTestId("plan-people-person");
    expect(within(withNumber).getByTestId("plan-call")).toHaveAttribute("href", "tel:+64215550100");
    expect(within(without).queryByTestId("plan-call")).toBeNull();
  });

  it("Add a person: Name and Phone number (optional), saved in its section", async () => {
    addPerson.mockReturnValueOnce(ok({ ...EMPTY_PLAN, people: [sam] }));
    open();
    fireEvent.click(screen.getByTestId("plan-people-add"));
    expect(screen.getByLabelText(p.name)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("plan-name"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText(p.phone), { target: { value: "+64 21 555 0100" } });
    await act(async () => fireEvent.click(screen.getByTestId("plan-person-save")));
    expect(addPerson).toHaveBeenCalledWith("people", "Sam", "+64 21 555 0100");
    expect(screen.getAllByTestId("plan-people-person")).toHaveLength(1);
  });

  it("Delete says Deleted. with Undo, which puts them back where they were", async () => {
    deletePerson.mockReturnValueOnce(ok(EMPTY_PLAN));
    addPerson.mockReturnValueOnce(ok({ ...EMPTY_PLAN, people: [sam] }));
    open({ ...EMPTY_PLAN, people: [sam] });
    await act(async () => fireEvent.click(screen.getByTestId("plan-delete")));
    expect(screen.getByTestId("plan-people-deleted")).toHaveTextContent(messages.toolbox.deleted);
    await act(async () => fireEvent.click(screen.getByTestId("plan-undo")));
    expect(addPerson).toHaveBeenCalledWith("people", "Sam", "+64 21 555 0100", 0);
  });

  it("10 in a section: no more to add there", () => {
    open({ ...EMPTY_PLAN, people: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, section: "people" as const, name: `P${i}`, phone: null, position: i })) });
    expect(screen.queryByTestId("plan-people-add")).toBeNull();
    expect(screen.getByTestId("plan-professionals-add")).toBeInTheDocument();
  });

  it("section 5 shows the country's helpline, read live and not removable", () => {
    open(EMPTY_PLAN, "NZ");
    const line = screen.getByTestId("plan-helpline");
    expect(line).toHaveTextContent(p.helpline);
    expect(within(line).getByTestId("plan-helpline-call").getAttribute("href")).toMatch(/^tel:/);
    expect(within(line).queryByTestId("plan-delete")).toBeNull();
    expect(within(screen.getByTestId("plan-professionals")).getByTestId("plan-helpline")).toBe(line);
  });

  it("no listed country: no helpline line, and the rest still there", () => {
    open(EMPTY_PLAN, "ZZ");
    expect(screen.queryByTestId("plan-helpline")).toBeNull();
    expect(screen.getByTestId("plan-professionals-add")).toBeInTheDocument();
  });

  it("a failed save: the generic line, and what was typed stays", async () => {
    saveText.mockReturnValueOnce(Promise.reject(new Error("offline")));
    open();
    fireEvent.change(screen.getByTestId("plan-distractions-text"), { target: { value: "The park" } });
    await act(async () => fireEvent.click(screen.getByTestId("plan-distractions-save")));
    expect(screen.getByTestId("plan-failed")).toHaveTextContent(messages.today.errGeneric);
    expect(screen.getByTestId("plan-distractions-text")).toHaveValue("The park");
  });
});
