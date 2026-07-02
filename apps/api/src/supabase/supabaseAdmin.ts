import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../errors/AppError";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (client) {
    return client;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new AppError(500, "SUPABASE_ADMIN_ENV_MISSING", "SUPABASE_ADMIN_ENV_MISSING");
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return client;
}
