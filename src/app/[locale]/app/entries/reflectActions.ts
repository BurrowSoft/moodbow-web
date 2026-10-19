"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { isUuid, reflectOutcome, type Reflection, type ReflectResult } from "@/lib/journal/reflect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const toSignIn = async () => redirect({ href: "/sign-in", locale: await getLocale() });

// One call of the reflect edge function (M9), server-side only, with the
// signed-in user's session (reflect.md: the function sends no CORS headers;
// the browser never calls it). Only the entry id and the tap's client_key
// are sent: the function reads the entry itself, as that user. No entry or
// reply text is logged here.
export async function reflectOnEntry(entryId: string, clientKey: string): Promise<ReflectResult> {
  if (!isUuid(entryId) || !isUuid(clientKey)) return { status: "error", message: "reflectError" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "reflectError" };
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) return toSignIn();
  const { data, error } = await supabase.functions.invoke("reflect", {
    body: { entry_id: entryId, client_key: clientKey },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response;
      if (response.status === 401) return toSignIn();
      const code = await response
        .json()
        .then((b: { error?: unknown }) => b?.error)
        .catch(() => undefined);
      // A gateway's own error page (502/504/546…): not the function's answer.
      if (typeof code !== "string") return { status: "no_answer" };
      return reflectOutcome(code);
    }
    // The function couldn't be reached from the server (relay or fetch
    // error): it may still have run; the same tap's key must be resent.
    return { status: "no_answer" };
  }
  const reflection = (data as { reflection?: Reflection } | null)?.reflection;
  if (!reflection || typeof reflection.body !== "string") return { status: "error", message: "reflectError" };
  const balance = (data as { credits?: { balance?: unknown } }).credits?.balance;
  return {
    status: "ok",
    reflection: { id: reflection.id, body: reflection.body, tier: reflection.tier === "lite" ? "lite" : "full", created_at: reflection.created_at },
    balance: typeof balance === "number" ? balance : null,
  };
}

export type DeleteReflectionResult = { ok: boolean };

// Me's own reflection, deleted by id (RLS: own rows only; reflect.md,
// "Reads, deletes, credits"). The entry stays.
export async function deleteReflection(id: string): Promise<DeleteReflectionResult> {
  if (!isUuid(id)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from("ai_reflections").delete().eq("id", id);
  if (error) {
    if (error.message.includes("JWT")) return toSignIn();
    return { ok: false };
  }
  return { ok: true };
}
