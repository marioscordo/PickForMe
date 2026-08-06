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
import type { MenuLanguage, TwoStepMenuSourceInput } from "./twoStepRecommendationSchemas";

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
  // Produktidee Juli 2026: ein fertig formulierter, hoeflicher Bestellsatz
  // fuer Kellner/Sommelier, unabhaengig von jeder konkreten Weinkarte -
  // funktioniert deshalb bei JEDEM Restaurant (anders als die konkrete
  // Weinauswahl aus recommendConcreteWineForMainDishAI.ts, die eine
  // auswertbare Weinkarte voraussetzt). Optional, damit bestehende
  // Konsumenten dieses Typs unveraendert funktionieren.
  sommelierPhrase?: string | null;
  confidence: "high" | "medium" | "low";
};

export async function recommendWineForMainDishAI({
  source,
  profile,
  mainDish,
  userLocale,
  menuLanguage,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: WineRecommendationProfile;
  mainDish: WineMainDishAnchor;
  userLocale?: string;
  menuLanguage?: MenuLanguage;
  signal?: AbortSignal;
}): Promise<WineRecommendation | null> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const sommelierPhraseLanguageCode = resolveSommelierPhraseLanguageCode(menuLanguage);
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
            targetLanguage,
            sommelierPhraseLanguageCode
          }),
          source
        })
      }
    ]
  };

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  const parsed = parseWineRecommendationResponse(response.output_text ?? "");

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
    sommelierPhrase: stringField(recommendation.sommelierPhrase) || null,
    confidence
  };
}

function parseWineRecommendationResponse(outputText: string) {
  try {
    return JSON.parse(stripJsonFence(outputText || "{}"));
  } catch {
    return null;
  }
}

// Fallanalyse Aug 2026 (Mario): sommelierPhrase richtet sich an das
// Restaurantpersonal vor Ort, nicht an den Nutzer - der Satz muss deshalb
// in der Sprache der Original-Speisekarte formuliert sein, nicht in der
// GUI-/Ausgabesprache des Nutzers (sonst versteht das Personal die Frage
// oft nicht). menuLanguage ist ein von uns selbst kontrolliertes,
// geschlossenes Enum (MenuLanguageSchema in twoStepRecommendationSchemas.ts)
// - eine zusaetzliche Sprachnamen-Zuordnungstabelle (wie getLanguageNameForLocale
// sie fuer die freien Geraete-Locales von targetLocale braucht) ist dafuer
// nicht noetig: das Modell kennt die ISO-Codes zuverlaessig direkt. Bei
// "unknown"/fehlend faellt die Wahl auf Englisch zurueck, analog zu
// buildOrderLabelsForMenuLanguage() in analyze-menu/route.ts (Lingua franca
// fuer das Personal, statt der Nutzersprache aufzuzwingen).
function resolveSommelierPhraseLanguageCode(menuLanguage: MenuLanguage | undefined) {
  return menuLanguage && menuLanguage !== "unknown" ? menuLanguage : "en";
}

function buildWinePrompt({
  profile,
  mainDish,
  targetLocale,
  targetLanguage,
  sommelierPhraseLanguageCode
}: {
  profile: WineRecommendationProfile;
  mainDish: WineMainDishAnchor;
  targetLocale: string;
  targetLanguage: string;
  sommelierPhraseLanguageCode: string;
}) {
  return [
    "Du bist GustaroAI und empfiehlst genau einen passenden Weinstil zu einem bestaetigten Hauptgericht.",
    "Es gibt in dieser Version keine Weinkarte. Empfiehl deshalb keinen konkreten Restaurantwein und keine Marke.",
    "Du darfst keine Speisekartenfakten erfinden.",
    `Sprache fuer nutzerseitige Ausgaben (title/wineStyle/reason/servingHint): ${targetLanguage} (${targetLocale}).`,
    `Sprache fuer das Feld sommelierPhrase: ISO-Sprachcode "${sommelierPhraseLanguageCode}" - unabhaengig von der obigen Nutzersprache, weil dieser Satz an das Restaurantpersonal vor Ort gerichtet ist, das ueblicherweise die Sprache der Speisekarte spricht, nicht die des Nutzers.`,
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
    "- sommelierPhrase ist ein einziger, hoeflich formulierter, fertig aussprechbarer Satz in der Sprache mit dem oben genannten ISO-Code fuer sommelierPhrase (Speisekarten-/Restaurantsprache, NICHT die Zielsprache der uebrigen Felder), mit dem der Nutzer einen Kellner oder Sommelier direkt nach einem passenden Wein fragen kann (z. B. 'Koennten Sie mir bitte einen trockenen, vollmundigen Rotwein empfehlen, idealerweise einen Nebbiolo oder Syrah?').",
    "- sommelierPhrase darf sich nur auf wineStyle/Rebsorten/Stilmerkmale beziehen, niemals auf eine konkrete Flasche, ein Weingut, einen Jahrgang oder einen Preis, da keine Weinkarte vorliegt.",
    "- sommelierPhrase muss unabhaengig von einem bestimmten Restaurant formulierbar sein und darf keine Speisekartenfakten voraussetzen.",
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "recommendation": {',
    '    "title": "kurzer Titel in der Zielsprache",',
    '    "wineStyle": "passender Weinstil, keine konkrete Flasche",',
    '    "reason": "kurze Begruendung in der Zielsprache",',
    '    "servingHint": "optionaler kurzer Hinweis oder null",',
    '    "sommelierPhrase": "fertig aussprechbarer Bestellsatz fuer Kellner/Sommelier in der Sprache mit dem oben genannten ISO-Code fuer sommelierPhrase, nicht in der Zielsprache",',
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
