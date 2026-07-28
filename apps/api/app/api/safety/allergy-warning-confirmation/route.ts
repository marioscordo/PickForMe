import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "../../../../src/auth/requireUser";
import { AppError } from "../../../../src/errors/AppError";
import { errorResponse } from "../../../../src/errors/errorResponse";
import { getSupabaseAdmin } from "../../../../src/supabase/supabaseAdmin";

const MAX_CONFIRMATION_VERSION_LENGTH = 80;

type ConfirmationBody = {
  confirmationTimestamp?: unknown;
  confirmationVersion?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as ConfirmationBody;
    const confirmationVersion = parseConfirmationVersion(body.confirmationVersion);
    const confirmationTimestamp = parseConfirmationTimestamp(body.confirmationTimestamp);

    const logged = await logConfirmationSafely(user.id, confirmationTimestamp, confirmationVersion);

    return NextResponse.json({
      ok: true,
      data: {
        logged
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// Bewusst fail-open: dies ist nur der Audit-Log-Eintrag der Bestaetigung, nicht
// der Sicherheitsmechanismus selbst - das ist der angezeigte Warnhinweis und
// der Klick des Nutzers darauf, der bereits passiert ist, bevor diese Funktion
// aufgerufen wird. Ein DB- oder Env-Fehler beim Protokollieren darf die
// Kernfunktion (Empfehlung anzeigen) nicht blockieren - gleiches Muster wie
// enforceDailySearchLimit in restaurant-discovery/route.ts.
async function logConfirmationSafely(
  userId: string,
  confirmationTimestamp: Date,
  confirmationVersion: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("allergy_warning_confirmations").insert({
      confirmation_timestamp: confirmationTimestamp.toISOString(),
      confirmation_version: confirmationVersion,
      user_id_hash: pseudonymizeUserId(userId)
    });

    if (error) {
      console.error("allergy_warning_confirmations insert failed", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("allergy_warning_confirmation logging failed, allowing confirmation to proceed", error);
    return false;
  }
}

function parseConfirmationVersion(value: unknown) {
  if (typeof value !== "string") {
    throw new AppError(400, "INVALID_CONFIRMATION_VERSION", "Ungültige Hinweis-Version.");
  }

  const version = value.trim();

  if (version.length === 0 || version.length > MAX_CONFIRMATION_VERSION_LENGTH) {
    throw new AppError(400, "INVALID_CONFIRMATION_VERSION", "Ungültige Hinweis-Version.");
  }

  return version;
}

function parseConfirmationTimestamp(value: unknown) {
  if (typeof value !== "string") {
    throw new AppError(400, "INVALID_CONFIRMATION_TIMESTAMP", "Ungültiger Bestätigungszeitpunkt.");
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new AppError(400, "INVALID_CONFIRMATION_TIMESTAMP", "Ungültiger Bestätigungszeitpunkt.");
  }

  return timestamp;
}

function pseudonymizeUserId(userId: string) {
  const salt = process.env.PICKFORME_USER_HASH_SALT ?? "pickforme-allergy-warning-v1";

  return createHash("sha256").update(`${salt}:${userId}`).digest("hex");
}
