import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { getSupabaseAdmin } from "../../../src/supabase/supabaseAdmin";
import { discoverRestaurantCandidatesOnly } from "../../../src/restaurant/discoverRestaurantSource";

const RestaurantDiscoveryRequestSchema = z.object({
  restaurantName: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().max(80).optional().default("")
});

// Kostenbremse: jede Suche loest einen KI-Websearch-Call aus (siehe
// discoverRestaurantSource.ts). Ohne Deckel koennte ein einzelner Nutzer
// beliebig oft suchen. 10/Tag ist grosszuegig fuer normale Nutzung, deckelt
// aber Missbrauch spuerbar - siehe Restaurant-Discovery-Minimalversion.
const MAX_DISCOVERY_SEARCHES_PER_DAY = 10;

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    const body = RestaurantDiscoveryRequestSchema.parse(await request.json());

    await enforceDailySearchLimit(user.id);

    const data = await discoverRestaurantCandidatesOnly(body);

    return NextResponse.json({
      ok: true,
      data
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError(400, "RESTAURANT_DISCOVERY_INVALID_REQUEST", "Bitte Restaurantname und Ort angeben.", error.issues)
      );
    }

    return errorResponse(error);
  }
}

async function enforceDailySearchLimit(userId: string) {
  const supabase = getSupabaseAdmin();
  const userIdHash = pseudonymizeUserId(userId);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error: countError } = await supabase
    .from("restaurant_discovery_searches")
    .select("id", { count: "exact", head: true })
    .eq("user_id_hash", userIdHash)
    .gte("created_at", startOfDay.toISOString());

  if (countError) {
    // Zaehlung fehlgeschlagen: die Suche trotzdem zuzulassen ist sicherer
    // als GustaroAI fuer alle Nutzer wegen eines DB-Fehlers zu blockieren.
    console.error("restaurant_discovery_searches count failed", countError);
  } else if ((count ?? 0) >= MAX_DISCOVERY_SEARCHES_PER_DAY) {
    throw new AppError(
      429,
      "RESTAURANT_DISCOVERY_DAILY_LIMIT_REACHED",
      "Du hast das Tageslimit für die Restaurantsuche erreicht. Bitte morgen erneut versuchen."
    );
  }

  const { error: insertError } = await supabase
    .from("restaurant_discovery_searches")
    .insert({ user_id_hash: userIdHash });

  if (insertError) {
    console.error("restaurant_discovery_searches insert failed", insertError);
  }
}

function pseudonymizeUserId(userId: string) {
  const salt = process.env.PICKFORME_USER_HASH_SALT ?? "pickforme-allergy-warning-v1";

  return createHash("sha256").update(`${salt}:${userId}`).digest("hex");
}
