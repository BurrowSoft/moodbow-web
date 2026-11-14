import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENTITLEMENT_COLUMNS, parseEntitlement, type EntitlementRow } from "./entitlements";

// The web's only service-role client (UX, #270, decision (a)): Moodbow Plus's
// Stripe webhook and its crons have no signed-in person, so they write as the
// server. Everything else on the web uses the person's own session and RLS
// (lib/supabase/server.ts). Limits:
// - Imported only by src/app/api/webhooks/stripe and src/app/api/cron/*
//   (serviceRole.imports.test.ts fails on any other importer).
// - It reaches entitlements, stripe_cancel_queue and (035) picture_deletions plus the
//   entry-pictures bucket's queued files, through the functions below; the client itself
//   is never exported.
// - SUPABASE_SERVICE_ROLE_KEY is never NEXT_PUBLIC_: staging's on Preview,
//   prod's on Production at launch (Vitor sets both).

let admin: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
export const serviceRoleConfigured = (): boolean => db() !== null;

type Result<T> = { ok: true; value: T } | { ok: false };
const fail = { ok: false } as const;

export type EntitlementWrite = Omit<EntitlementRow, "user_id" | "source"> & { source: "stripe" };

export async function readEntitlement(userId: string): Promise<Result<EntitlementRow | null>> {
  const client = db();
  if (!client) return fail;
  const { data, error } = await client.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("user_id", userId).maybeSingle();
  return error ? fail : { ok: true, value: parseEntitlement(data) };
}

// A new row (none yet for this person). false when one appeared meanwhile:
// the caller reads again.
export async function insertEntitlement(userId: string, row: EntitlementWrite): Promise<Result<boolean>> {
  const client = db();
  if (!client) return fail;
  const { data, error } = await client
    .from("entitlements")
    .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("user_id");
  return error ? fail : { ok: true, value: (data?.length ?? 0) > 0 };
}

// Updates the row only while it still holds what the caller read (its source
// and store subscription id), so a concurrent change wins and the caller
// reads again. true when a row changed.
export async function updateEntitlement(
  userId: string,
  seen: Pick<EntitlementRow, "source" | "store_subscription_id">,
  row: EntitlementWrite,
): Promise<Result<boolean>> {
  const client = db();
  if (!client) return fail;
  let q = client
    .from("entitlements")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("source", seen.source);
  q = seen.store_subscription_id === null ? q.is("store_subscription_id", null) : q.eq("store_subscription_id", seen.store_subscription_id);
  const { data, error } = await q.select("user_id");
  return error ? fail : { ok: true, value: (data?.length ?? 0) > 0 };
}

// Every Stripe row, for the daily reconcile (read-only).
export async function readStripeEntitlements(): Promise<Result<EntitlementRow[]>> {
  const client = db();
  if (!client) return fail;
  const rows: EntitlementRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("entitlements").select(ENTITLEMENT_COLUMNS).eq("source", "stripe").order("user_id").range(from, from + 999);
    if (error) return fail;
    for (const r of data ?? []) {
      const row = parseEntitlement(r);
      if (row) rows.push(row);
    }
    if (!data || data.length < 1000) return { ok: true, value: rows };
  }
}

// Subscriptions left by accounts deleted in the app (delete_my_account queues
// them): the daily cancel cron's list, and its done.
export async function readCancelQueue(): Promise<Result<string[]>> {
  const client = db();
  if (!client) return fail;
  const { data, error } = await client.from("stripe_cancel_queue").select("store_subscription_id").limit(500);
  if (error) return fail;
  return { ok: true, value: (data ?? []).map((r) => (r as { store_subscription_id: unknown }).store_subscription_id).filter((s): s is string => typeof s === "string") };
}

export async function clearCancelQueue(subscriptionId: string): Promise<boolean> {
  const client = db();
  if (!client) return false;
  const { error } = await client.from("stripe_cancel_queue").delete().eq("store_subscription_id", subscriptionId);
  return !error;
}

// Pictures for moments (035): files whose rows are gone (a picture removed, its entry or the
// account deleted, a reservation never confirmed) wait in picture_deletions until the Storage API
// deletes them. Oldest first, a batch at a time.
export type QueuedPicture = { id: number; user_id: string; path: string; attempts: number };
export async function readPictureQueue(limit: number): Promise<Result<QueuedPicture[]>> {
  const client = db();
  if (!client) return fail;
  const { data, error } = await client.from("picture_deletions").select("id, user_id, path, attempts").order("queued_at").limit(limit);
  if (error) return fail;
  const rows: QueuedPicture[] = [];
  for (const r of (data ?? []) as Partial<QueuedPicture>[]) {
    if (typeof r.id === "number" && typeof r.user_id === "string" && typeof r.path === "string" && typeof r.attempts === "number") rows.push(r as QueuedPicture);
  }
  return { ok: true, value: rows };
}
// Deletes these files from the private bucket. A file already gone counts as deleted (the API
// answers without an error and simply lists fewer): the queue may run twice.
export async function removePictureFiles(paths: string[]): Promise<boolean> {
  const client = db();
  if (!client) return false;
  if (paths.length === 0) return true;
  const { error } = await client.storage.from("entry-pictures").remove(paths);
  return !error;
}
export async function clearPictureQueue(ids: number[]): Promise<boolean> {
  const client = db();
  if (!client) return false;
  if (ids.length === 0) return true;
  const { error } = await client.from("picture_deletions").delete().in("id", ids);
  return !error;
}
// A failed try: counted, and left queued for the next run.
export async function failPictureQueue(rows: Pick<QueuedPicture, "id" | "attempts">[]): Promise<void> {
  const client = db();
  if (!client) return;
  const at = new Date().toISOString();
  for (const r of rows) await client.from("picture_deletions").update({ attempts: r.attempts + 1, last_failed_at: at }).eq("id", r.id);
}
