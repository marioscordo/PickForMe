import { AppError } from "../errors/AppError";
import { getSupabaseAnon } from "../supabase/supabaseAnon";

export async function requireUser(request: Request): Promise<{ id: string; email?: string }> {
  const devEmail = request.headers.get("x-pickforme-dev-email");

  if (devEmail) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(403, "DEV_AUTH_DISABLED", "Dev-Login ist in Production deaktiviert.");
    }

    if (devEmail !== "mario.scordo@t-online.de") {
      throw new AppError(403, "DEV_USER_NOT_ALLOWED", "Dieser Dev-User ist nicht freigeschaltet.");
    }

    return {
      id: "00000000-0000-0000-0000-000000000001",
      email: devEmail
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new AppError(401, "AUTH_REQUIRED", "Nicht eingeloggt.");
  }

  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new AppError(401, "SESSION_INVALID", "Session ungültig oder abgelaufen.");
  }

  return {
    id: data.user.id,
    email: data.user.email || undefined
  };
}
