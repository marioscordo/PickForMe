import { env } from "../config/env";
import { supabase } from "./supabaseClient";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (env.devMode && env.devEmail) {
    return {
      "x-pickforme-dev-email": env.devEmail
    };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Du bist nicht eingeloggt.");
  }

  return {
    Authorization: `Bearer ${token}`
  };
}
