"use server";

import { pageGate } from "@/lib/conditions";
import { parseSharedWeek, type SharedWeek } from "@/lib/share/trustedShare";
import { EXPIRY_DAYS, parseShareLinks, SHARE_CONSENT_VERSION, SHARE_LINK_COLUMNS, type ShareLink } from "@/lib/share/shareLinks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Me → Share (1.4 G): the owner's own links, as the signed-in person (RLS and 040's functions,
// which check everything again). The token comes back once, from create, straight to the screen
// that shows it; it's never stored, logged or returned by anything else.
async function client() {
  if (pageGate("trusted-share-live") === "hidden") return null;
  return createSupabaseServerClient();
}

export type LinksResult = { status: "ok"; links: ShareLink[] } | { status: "error" };
export async function loadShareLinks(): Promise<LinksResult> {
  const supabase = await client();
  if (!supabase) return { status: "error" };
  const { data, error } = await supabase.from("share_links").select(SHARE_LINK_COLUMNS);
  return error ? { status: "error" } : { status: "ok", links: parseShareLinks(data) };
}

export type ShareOptions = { firstName: string; routineItemIds: string[]; expiryDays: number };
const cleanIds = (ids: unknown): string[] => (Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, 20) : []);

// The exact preview (UX's condition): share_preview runs the same builder share_view does.
export async function previewShare(options: ShareOptions): Promise<SharedWeek> {
  const supabase = await client();
  if (!supabase) return { status: "unavailable" };
  const ids = cleanIds(options?.routineItemIds);
  const { data, error } = await supabase.rpc("share_preview", { p_include_routine: ids.length > 0, p_routine_item_ids: ids, p_first_name: typeof options?.firstName === "string" ? options.firstName : null });
  return error ? { status: "unavailable" } : parseSharedWeek(data);
}

export type CreateResult = { status: "ok"; token: string; expiresAt: string } | { status: "error"; error: "limit" | "failed" };
export async function createShare(options: ShareOptions): Promise<CreateResult> {
  const supabase = await client();
  if (!supabase) return { status: "error", error: "failed" };
  const ids = cleanIds(options?.routineItemIds);
  const expiry = (EXPIRY_DAYS as readonly number[]).includes(options?.expiryDays) ? options.expiryDays : 30;
  const { data, error } = await supabase.rpc("share_create", {
    p_first_name: typeof options?.firstName === "string" && options.firstName.trim() !== "" ? options.firstName : null,
    p_include_routine: ids.length > 0,
    p_routine_item_ids: ids,
    p_expiry_days: expiry,
    p_consent_version: SHARE_CONSENT_VERSION,
  });
  if (error) return { status: "error", error: error.message?.includes("limit_reached") ? "limit" : "failed" };
  const d = data as { token?: unknown; expires_at?: unknown } | null;
  return typeof d?.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(d.token) && typeof d.expires_at === "string" ? { status: "ok", token: d.token, expiresAt: d.expires_at } : { status: "error", error: "failed" };
}

export async function stopShare(id: string): Promise<LinksResult> {
  const supabase = await client();
  if (!supabase || typeof id !== "string") return { status: "error" };
  const { error } = await supabase.rpc("share_revoke", { p_id: id });
  return error ? { status: "error" } : loadShareLinks();
}

// "Got it" on a Today note: the database keeps the seen, for every device.
export async function markShareSeen(id: string, what: "created" | "first_view"): Promise<boolean> {
  const supabase = await client();
  if (!supabase || typeof id !== "string" || (what !== "created" && what !== "first_view")) return false;
  const { data, error } = await supabase.rpc("share_mark_seen", { p_id: id, p_what: what });
  return !error && data === true;
}
