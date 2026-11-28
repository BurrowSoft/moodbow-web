import { describe, expect, it, vi } from "vitest";
import { GET_ME_ARGS, readMe } from "./me";

// get_me as this build calls it (moodbow-app 044, run sheet C1b): ai_available is the switch AND
// p_client_ai >= 1, so every read says this build can show AI; before 044 is applied (or after a rollback)
// PostgREST has no such function (PGRST202) and the read goes once more without it, as the app does.
const ME = { today: "2026-11-25", ai_available: true };
const NO_FUNCTION = { code: "PGRST202", message: "Could not find the function public.get_me(p_client_ai) in the schema cache" };
const withAnswers = (...answers: { data: unknown; error: unknown }[]) => {
  const rpc = vi.fn<(name: string, args?: object) => Promise<{ data: unknown; error: unknown }>>(async () => answers.shift() ?? { data: null, error: { message: "nothing more" } });
  return { rpc, supabase: { rpc } as never };
};

describe("readMe: get_me with this build's AI flag (044)", () => {
  it("every read passes p_client_ai: 1", async () => {
    const { rpc, supabase } = withAnswers({ data: ME, error: null });
    expect(await readMe(supabase)).toEqual({ me: ME, unreachable: false });
    expect(rpc.mock.calls).toEqual([["get_me", { p_client_ai: 1 }]]);
    expect(GET_ME_ARGS).toEqual({ p_client_ai: 1 });
  });

  it("044 not applied (PGRST202): once more without it, so nobody is locked out whatever the release order", async () => {
    const { rpc, supabase } = withAnswers({ data: null, error: NO_FUNCTION }, { data: ME, error: null });
    expect(await readMe(supabase)).toEqual({ me: ME, unreachable: false });
    expect(rpc.mock.calls).toEqual([["get_me", { p_client_ai: 1 }], ["get_me"]]);
  });

  it("only once: PGRST202 again means no me (the couldn't-load page), never a third call", async () => {
    const { rpc, supabase } = withAnswers({ data: null, error: NO_FUNCTION }, { data: null, error: NO_FUNCTION });
    expect((await readMe(supabase)).me).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("any other error: no retry without the flag (it would only hide AI from this build)", async () => {
    const { rpc, supabase } = withAnswers({ data: null, error: { code: "42501", message: "permission denied" } }, { data: ME, error: null });
    expect((await readMe(supabase)).me).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
