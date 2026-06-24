import OpenAI from "openai";
import { z } from "zod";
import type { Dish } from "../types/menu";
import type { Situation, UserProfile } from "../types/profile";
import type { Recommendation } from "../types/recommendations";
import { blockReasonForRecommendation, buildProfilePromptLines } from "../profile/profileRules";

const PickForMeAIResponseSchema = z.object({
  recommendations: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(3),
        nameOriginal: z.string().min(2),
        priceRaw: z.string().optional(),
        descriptionOriginal: z.string().optional(),
        reason: z.string().min(8),
        evidence: z.string().min(8)
      })
    )
    .min(1).max(3)
});

type PickForMeAIResponse = z.infer<typeof PickForMeAIResponseSchema>;

export async function askPickForMeAI({
  menuText,
  profile,
  situation
}: {
  menuText: string;
  profile: UserProfile;
  situation: Situation;
}): Promise<{ dishes: Dish[]; recommendations: Recommendation[] }> {
  if (process.env.PICKFORME_AI_ENABLED !== "true") {
    throw new Error("PickForMe AI ist nicht aktiviert.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt()
      },
      {
        role: "user",
        content: buildUserPrompt(menuText, profile, situation)
      }
    ]
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Die KI hat keine Antwort geliefert.");
  }

  const parsedJson = JSON.parse(content) as unknown;
  const parsed = PickForMeAIResponseSchema.parse(parsedJson);
  const validated = validateOriginalEvidence(parsed, menuText);
  const profileSafe = validateAgainstProfile(validated, profile);

  return toAnalyzeDataParts(profileSafe);
}

function buildSystemPrompt() {
  return [
    "Du bist PickForMe, ein persoenlicher Restaurant-Assistent.",
    "Du liest chaotische Speisekartentexte semantisch.",
    "Du darfst ausschliesslich Gerichte empfehlen, die wirklich im Originaltext vorkommen.",
    "Du darfst keine Gerichte erfinden.",
    "Du darfst Gerichtsnamen nicht veraendern oder schoener formulieren.",
    "Du darfst Preise nur uebernehmen, wenn sie im Originaltext erkennbar sind.",
    "Du bewertest nicht die Restaurantqualitaet.",
    "Harte Profil-Ausschluesse sind verbindlich und duerfen nie durch Vorlieben ueberstimmt werden.",
    "Bei Allergien oder Unvertraeglichkeiten gilt: Wenn unsicher, nicht empfehlen.",
    "Du gibst ausschliesslich valides JSON aus.",
    "Das JSON-Format ist:",
    "{",
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "nameOriginal": "Originaler Gerichtsname aus der Karte",',
    '      "priceRaw": "Preis aus dem Original, falls vorhanden",',
    '      "descriptionOriginal": "kurze Beschreibung aus dem Original, falls vorhanden",',
    '      "reason": "kurze persoenliche Begruendung",',
    '      "evidence": "Originalausschnitt aus der Speisekarte"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function buildUserPrompt(menuText: string, profile: UserProfile, situation: Situation) {
  return [
    ...buildProfilePromptLines(profile, situation),
    "",
    "Aufgabe:",
    "Waehle bis zu 3 passende echte und sichere Gerichte aus der folgenden Speisekarte.",
    "Beachte harte Ausschluesse, Allergien und Unvertraeglichkeiten strikt.",
    "Nutze Vorlieben, Ausnahmen, Ess-Stimmung und aktuelle Situation fuer das Ranking.",
    "Wenn ein Gericht gut passt, aber eine aktive Abneigung, einen aktiven Ausschluss oder eine aktive Unvertraeglichkeit enthaelt, empfehle es nicht.",
    "Gib zu jedem Gericht einen evidence-Ausschnitt an, der woertlich oder nahezu woertlich im Originaltext vorkommt.",
    "",
    "Speisekartentext:",
    menuText
  ].join("\n");
}

function validateOriginalEvidence(result: PickForMeAIResponse, menuText: string): PickForMeAIResponse {
  const normalizedMenu = normalize(menuText);

  const validRecommendations = result.recommendations.filter((recommendation) => {
    const evidence = normalize(recommendation.evidence);
    const name = normalize(recommendation.nameOriginal);

    if (!evidence || !name) {
      return false;
    }

    const evidenceMatches = normalizedMenu.includes(evidence);
    const nameMatches = normalizedMenu.includes(name);

    return evidenceMatches || nameMatches;
  });

  if (validRecommendations.length === 0) {
    throw new Error("Die KI-Antwort enthielt keine sicher belegbare Empfehlung.");
  }

  if (validRecommendations.length !== result.recommendations.length) {
    throw new Error("Mindestens eine KI-Empfehlung konnte nicht sicher gegen den Originaltext validiert werden.");
  }

  return {
    recommendations: validRecommendations
  };
}

function validateAgainstProfile(result: PickForMeAIResponse, profile: UserProfile): PickForMeAIResponse {
  const blocked = result.recommendations.filter((recommendation) => blockReasonForRecommendation(recommendation, profile));

  if (blocked.length > 0) {
    throw new Error(
      `Die KI-Antwort verletzt aktive Profilregeln: ${blocked.map((item) => item.nameOriginal).join(", ")}`
    );
  }

  return result;
}

function toAnalyzeDataParts(result: PickForMeAIResponse): {
  dishes: Dish[];
  recommendations: Recommendation[];
} {
  const dishes: Dish[] = result.recommendations.map((item, index) => ({
    id: `ai_dish_${String(index + 1).padStart(3, "0")}`,
    nameOriginal: item.nameOriginal,
    descriptionOriginal: item.descriptionOriginal,
    price: item.priceRaw ? parsePrice(item.priceRaw) : undefined,
    sourceLine: item.evidence
  }));

  const recommendations: Recommendation[] = dishes.map((dish, index) => ({
    dishId: dish.id,
    reason: result.recommendations[index]?.reason ?? "Passt zu Deinem Profil und der aktuellen Situation."
  }));

  return {
    dishes,
    recommendations
  };
}

function parsePrice(priceRaw: string) {
  const match = priceRaw.match(/(\d{1,3})(?:[,.](\d{2}))?/);

  if (!match) {
    return undefined;
  }

  const euros = match[1];
  const cents = match[2] ?? "00";
  const value = Number(`${euros}.${cents}`);

  return Number.isFinite(value) ? value : undefined;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?()[\]{}"']/g, "")
    .trim();
}


