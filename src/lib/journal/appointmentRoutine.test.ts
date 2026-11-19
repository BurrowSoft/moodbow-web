// @vitest-environment node
import { describe, expect, it } from "vitest";
import contract from "../../../content/appointment.json";
import { routineSection, weeksDays, type AppointmentRoutineItem, type Weeks } from "./appointment";

type Case = { name: string; today: string; weeks: Weeks; checkIns: string[]; routine: AppointmentRoutineItem[]; expect: unknown };

describe("For my appointment: Routine (content/appointment.json routineCases)", () => {
  for (const c of contract.routineCases as unknown as Case[]) {
    it(c.name, () => {
      expect(routineSection(c.checkIns, weeksDays(c.today, c.weeks), c.routine)).toEqual(c.expect);
    });
  }

  it("never a mood: each line is a percent or not enough, nothing else", () => {
    for (const c of contract.routineCases as unknown as Case[])
      for (const line of routineSection(c.checkIns, weeksDays(c.today, c.weeks), c.routine) ?? []) expect(Object.keys(line).sort()).toEqual(line.state === "percent" ? ["id", "percent", "state"] : ["id", "state"]);
  });
});
