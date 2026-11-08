import { LocalAdapter } from "./local";
import { SupabaseAdapter } from "./supabase";
import type { StorageAdapter } from "./types";

// Cloud mode turns on when both keys are set at build time (see README).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const storage: StorageAdapter = url && key ? new SupabaseAdapter(url, key) : new LocalAdapter();
export * from "./types";
