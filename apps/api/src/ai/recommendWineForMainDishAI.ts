import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { WineRecommendationProfile } from "../wine/wineProfile";
import {
  buildTwoStepSourceContent,
  createTwoStepOpenAIClient,
  getLanguageNameForLocale,
  getTwoStepModelForSource,
  normalizeTargetLocale,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import type { TwoStepMenuSourceInput } from "./twoStepRecommendationSchemas";

export type WineMainDishAnchor = {
  rank?: number;
  nameOriginal: string;
  translatedName?: string;
  descriptionOriginal?: string | null;
  translatedDescription?: string | null;
  sourceEvidence?: string | null;
  reason?: string;
};

export type WineRecommendation = {
  title: string;
  wineStyle: string;
  reason: string;
  servingHint?: string | null;
  confidence: "high" | "medium" | "low";
};

export async function recommendWineForMainDishAI({
  source,
  profile,
  mainDish,
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: WineRecommendationProfile;
  mainDish: WineMainDishAnchor;
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<WineRecommendation | null> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const request: ResponseCreateParamsNonStreaming = {
    model: getTwoStepModelForSource(source),
    input: [
      {
        role: "user",
        content: buildTwoStepSourceContent({
          prompt: buildWinePrompt({
            profile,
            mainDish,
            targetLocale,
            targetLanguage
          }),
          source
        })
      }
    ]
  };

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  const parsed = JSON.parse(stripJsonFence(response.output_text ?? "{}"));

  if (!isRecord(parsed) || !isRecord(parsed.recommendation)) {
    return null;
  }

  const recommendation = parsed.recommendation;
  const title = stringField(recommendation.title);
  const wineStyle = stringField(recommendation.wineStyle);
  const reason = stringField(recommendation.reason);
  const confidence = stringField(recommendation.confidence);

  if (!title || !wineStyle || !reason || !isWineConfidence(confidence)) {
    return null;
  }

  if (confidence === "low") {
    return null;
  }

  return {
    title,
    wineStyle,
    reason,
    servingHint: stringField(recommendation.servingHint) || null,
    confidence
  };
}

function buildWinePrompt({
  profile,
  mainDish,
  targetLocale,
  targetLanguage
}: {
  profile: WineRecommendationProfile;
  mainDish: WineMainDishAnchor;
  targetLocale: string;
  targetLanguage: string;
}) {
  return [
    "Du bist GustaroAI und empfiehlst genau einen passenden Weinstil zu einem bestaetigten Hauptgericht.",
    "Es gibt in dieser Version keine Weinkarte. Empfiehl deshalb keinen konkreten Restaurantwein und keine Marke.",
    "Du darfst keine Speisekartenfakten erfinden.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Bestaetigtes Hauptgericht als Pflichtanker:",
    JSON.stringify({ mainDish }),
    "",
    "Weinprofil des Nutzers:",
    JSON.stringify(profile.winePreference ?? {}),
    "",
    "Verbindliche Regeln:",
    "- Allergien, Unvertraeglichkeiten, harte Ausschluesse und ausgeschlossene Weinstile sind verbindlich.",
    "- Wenn der Nutzer Alkohol ausschliesst oder keine Weinempfehlung sicher passend ist, gib recommendation null zurueck.",
    "- Falls keine ausreichenden Informationen zum Gericht vorhanden sind, gib eine vorsichtige Stil-Empfehlung nur bei confidence medium oder high.",
    "- Keine konkrete Flasche, kein Jahrgang, kein Weingut, kein Preis.",
    "- wineStyle muss kurz und praktisch sein.",
    "- reason muss direkt auf Gericht und Weinprofil eingehen.",
    "- servingHint ist optional und darf kurz Temperatur, Koerper oder Alternative nennen.",
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "recommendation": {',
    '    "title": "kurzer Titel in der Zielsprache",',
    '    "wineStyle": "passender Weinstil, keine konkrete Flasche",',
    '    "reason": "kurze Begruendung in der Zielsprache",',
    '    "servingHint": "optionaler kurzer Hinweis oder null",',
    '    "confidence": "high | medium | low"',
    "  }",
    "}"
  ].join("\n");
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isWineConfidence(value: string): value is WineRecommendation["confidence"] {
  return value === "high" || value === "medium" || value === "low";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
