import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { WineCandidate } from "../wine/extractWineCandidates";
import type { WineRecommendationProfile } from "../wine/wineProfile";
import {
  buildTwoStepSourceContent,
  createTwoStepOpenAIClient,
  getLanguageNameForLocale,
  getTwoStepModelForSource,
  normalizeTargetLocale,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import type { WineMainDishAnchor } from "./recommendWineForMainDishAI";
import type { TwoStepMenuSourceInput } from "./twoStepRecommendationSchemas";

export type ConcreteWineRecommendation = {
  recommendationType: "concrete_wine";
  title: string;
  primaryWine: {
    nameOriginal: string;
    displayName: string;
    grapeOrStyle?: string | null;
    region?: string | null;
    vintage?: string | null;
    glassPriceRaw: string;
    priceRaw?: string | null;
    prices?: WineCandidate["prices"];
    servingUnit?: "glass" | "bottle" | "unknown";
    sourceEvidence: string;
  };
  reason: string;
  servingHint?: string | null;
  confidence: "high" | "medium";
};

export async function recommendConcreteWineForMainDishAI({
  source,
  profile,
  mainDish,
  wineCandidates,
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: WineRecommendationProfile;
  mainDish: WineMainDishAnchor;
  wineCandidates: WineCandidate[];
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<ConcreteWineRecommendation | null> {
  if (wineCandidates.length === 0) {
    return null;
  }

  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const request: ResponseCreateParamsNonStreaming = {
    model: getTwoStepModelForSource(source),
    input: [
      {
        role: "user",
        content: buildTwoStepSourceContent({
          prompt: buildConcreteWinePrompt({
            profile,
            mainDish,
            wineCandidates,
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
  const primaryWine = parseConcreteWine(recommendation.primaryWine, wineCandidates);
  const title = stringField(recommendation.title);
  const reason = stringField(recommendation.reason);
  const confidence = stringField(recommendation.confidence);

  if (!primaryWine || !title || !reason || (confidence !== "high" && confidence !== "medium")) {
    return null;
  }

  return {
    recommendationType: "concrete_wine",
    title,
    primaryWine,
    reason,
    servingHint: stringField(recommendation.servingHint) || null,
    confidence
  };
}

function buildConcreteWinePrompt({
  profile,
  mainDish,
  wineCandidates,
  targetLocale,
  targetLanguage
}: {
  profile: WineRecommendationProfile;
  mainDish: WineMainDishAnchor;
  wineCandidates: WineCandidate[];
  targetLocale: string;
  targetLanguage: string;
}) {
  return [
    "Du bist GustaroAI und suchst einen konkreten passenden Wein aus einer sichtbaren Weinkarte.",
    "Du darfst genau einen Wein aus wineCandidates auswaehlen.",
    "Du darfst keine Weine, Preise, Jahrgaenge, Rebsorten oder Verfuegbarkeit erfinden.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Bestaetigtes Hauptgericht:",
    JSON.stringify({ mainDish }),
    "",
    "Weinprofil des Nutzers:",
    JSON.stringify(profile.winePreference ?? {}),
    "",
    "WineCandidates als einzige Quelle fuer konkrete Weine:",
    JSON.stringify(wineCandidates),
    "",
    "Regeln:",
    "- Waehle nur einen Kandidaten, der zum Gericht und Weinprofil passt.",
    "- Der konkrete Wein muss einen sichtbaren Glaspreis haben.",
    "- glassPriceRaw ist Pflicht und muss exakt ein sichtbarer Glaspreis mit Waehrungszeichen aus der Weinkartenquelle sein.",
    "- Wenn mehrere Preise beim Wein sichtbar sind, ist der niedrigere Preis der Glaspreis.",
    "- Wenn kein Glaspreis mit Waehrungszeichen sicher sichtbar ist, gib recommendation null zurueck.",
    "- Harte Ausschluesse wie kein Alkohol, kein Rotwein oder kein starkes Holz sind verbindlich.",
    "- Wenn kein Kandidat sicher passt, gib recommendation null zurueck.",
    "- primaryWine.sourceEvidence muss exakt einem wineCandidate.sourceEvidence entsprechen.",
    "- Begruende kurz und praktisch.",
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "recommendation": {',
    '    "title": "kurzer Titel in der Zielsprache",',
    '    "primaryWine": {',
    '      "nameOriginal": "exakter Originalname aus wineCandidates",',
    '      "displayName": "nutzerseitige Anzeige",',
    '      "grapeOrStyle": "aus Kandidat falls vorhanden, sonst null",',
    '      "region": "aus Kandidat falls vorhanden, sonst null",',
    '      "vintage": "aus Kandidat falls vorhanden, sonst null",',
    '      "glassPriceRaw": "exakter Glaspreis mit Waehrungszeichen, Pflicht",',
    '      "priceRaw": "aus Kandidat falls vorhanden, sonst null",',
    '      "servingUnit": "glass | bottle | unknown",',
    '      "sourceEvidence": "exakter Originalbeleg aus wineCandidates"',
    "    },",
    '    "reason": "kurze Begruendung in der Zielsprache",',
    '    "servingHint": "optionaler kurzer Hinweis oder null",',
    '    "confidence": "high | medium | low"',
    "  }",
    "}"
  ].join("\n");
}

function parseConcreteWine(value: unknown, wineCandidates: WineCandidate[]): ConcreteWineRecommendation["primaryWine"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceEvidence = stringField(value.sourceEvidence);
  const matchingCandidate = wineCandidates.find((candidate) => candidate.sourceEvidence === sourceEvidence);

  if (!matchingCandidate) {
    return null;
  }

  const nameOriginal = stringField(value.nameOriginal) || matchingCandidate.nameOriginal;
  const displayName = stringField(value.displayName) || nameOriginal;
  const glassPriceRaw = stringField(value.glassPriceRaw) || matchingCandidate.glassPriceRaw || "";

  if (!nameOriginal || !displayName || !hasCurrencyMarker(glassPriceRaw)) {
    return null;
  }

  return {
    nameOriginal,
    displayName,
    grapeOrStyle: stringField(value.grapeOrStyle) || matchingCandidate.grapeOrStyle || null,
    region: stringField(value.region) || matchingCandidate.region || null,
    vintage: stringField(value.vintage) || matchingCandidate.vintage || null,
    glassPriceRaw,
    priceRaw: stringField(value.priceRaw) || matchingCandidate.priceRaw || null,
    prices: matchingCandidate.prices,
    servingUnit: isServingUnit(value.servingUnit) ? value.servingUnit : matchingCandidate.servingUnit,
    sourceEvidence
  };
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isServingUnit(value: unknown): value is NonNullable<ConcreteWineRecommendation["primaryWine"]["servingUnit"]> {
  return value === "glass" || value === "bottle" || value === "unknown";
}

function hasCurrencyMarker(value: string) {
  return /(?:\u20ac|eur|euro)/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
