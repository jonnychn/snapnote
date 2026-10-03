import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = "https://qwghoeqpxurhdinotgch.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_3P_afFJtwu1PQlm1PaKmvg_TZvcq_BE";

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (typeof window === "undefined") {
    throw new Error("Sign-in is only available in the browser.");
  }
  if (!client) {
    client = createClient(URL, PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    });
  }
  return client;
}
