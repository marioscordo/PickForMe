import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../errors/AppError";

let client: SupabaseClient | null = null;

export function getSupabaseAnon() {
  if (client) {
    return client;
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new AppError(500, "SUPABASE_ENV_MISSING", "Supabase-Umgebung ist nicht konfiguriert.");
  }

  client = createClient(url, anonKey);
  return client;
}
