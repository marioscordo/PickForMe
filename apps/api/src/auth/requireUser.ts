import { AppError } from "../errors/AppError";
import { getSupabaseAnon } from "../supabase/supabaseAnon";

export async function requireUser(request: Request): Promise<{ id: string; email?: string }> {
  const devEmail = request.headers.get("x-pickforme-dev-email")?.trim().toLowerCase();
  const localRequest = isLocalRequest(request);

  if (devEmail) {
    if (process.env.NODE_ENV === "production" && !localRequest) {
      throw new AppError(403, "DEV_AUTH_DISABLED", "Dev-Login ist in Production deaktiviert.");
    }

    const allowedDevEmails = new Set([
      process.env.PICKFORME_DEV_EMAIL?.trim().toLowerCase(),
      "dev@pickforme.local"
    ].filter((value): value is string => Boolean(value)));

    if (!localRequest && !allowedDevEmails.has(devEmail)) {
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

function isLocalRequest(request: Request) {
  const hostCandidates = [
    safeUrlHostname(request.url),
    request.headers.get("host")?.split(":")[0],
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().split(":")[0]
  ];

  return hostCandidates.some((host) => Boolean(host && isLocalHostname(host)));
}

function safeUrlHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function isLocalHostname(host: string) {
  const normalized = host.toLowerCase();
  const ipv4Match = normalized.match(/^172\.(\d{1,2})\./);
  const secondOctet = ipv4Match ? Number(ipv4Match[1]) : null;

  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("10.") ||
    (secondOctet !== null && secondOctet >= 16 && secondOctet <= 31);
}
