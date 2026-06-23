import OpenAI from "openai";
import { z } from "zod";
import type { Dish } from "../types/menu";
import type { Situation, UserProfile } from "../types/profile";
import type { Recommendation } from "../types/recommendations";

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
    .length(3)
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
    temperature: 0.2,
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

  return toAnalyzeDataParts(validated);
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
    "Du gibst exakt JSON aus.",
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
    "Nutzerprofil:",
    `Name: ${profile.displayName}`,
    `Ernaehrungsstil: ${profile.dietStyle}`,
    `Starke Vorlieben: ${profile.primaryLikes.join(", ") || "keine angegeben"}`,
    `Weitere Vorlieben: ${profile.secondaryLikes.join(", ") || "keine angegeben"}`,
    `Abneigungen: ${profile.dislikes.join(", ") || "keine angegeben"}`,
    `Unvertraeglichkeiten / harte Ausschluesse: ${profile.intolerances.join(", ") || "keine angegeben"}`,
    `Aktuelle Situation: ${situation}`,
    "",
    "Aufgabe:",
    "Waehle genau 3 passende echte Gerichte aus der folgenden Speisekarte.",
    "Beachte harte Ausschluesse und Abneigungen.",
    "Nutze die Vorlieben und die aktuelle Situation fuer die Auswahl.",
    "Wenn ein Gericht gut passt, aber eine Abneigung oder Unvertraeglichkeit enthaelt, empfehle es nicht.",
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

  if (validRecommendations.length !== 3) {
    throw new Error("Die KI-Antwort konnte nicht sicher gegen den Originaltext validiert werden.");
  }

  return {
    recommendations: validRecommendations
  };
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
