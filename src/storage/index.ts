import { LocalAdapter } from "./local";
import { SupabaseAdapter } from "./supabase";
import type { StorageAdapter } from "./types";
import { SUPABASE } from "../config";

// Cloud mode: build-time env vars win, otherwise the project in config.ts.
// The URL is cleaned up in case it was copied with /rest/v1/ or a trailing slash.
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || SUPABASE.url;
const url = rawUrl.replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || SUPABASE.publishableKey;

export const storage: StorageAdapter = url && key ? new SupabaseAdapter(url, key) : new LocalAdapter();
export * from "./types";
