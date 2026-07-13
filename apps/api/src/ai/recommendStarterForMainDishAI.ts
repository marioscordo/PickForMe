import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { Situation, UserProfile } from "../types/profile";
import {
  buildTwoStepProfileContext,
  buildTwoStepSourceContent,
  createTwoStepOpenAIClient,
  getLanguageNameForLocale,
  getTwoStepModelForSource,
  normalizeTargetLocale,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import {
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";

export type StarterMainDishAnchor = {
  rank?: number;
  nameOriginal: string;
  translatedName?: string;
  priceRaw?: string | null;
  sourceEvidence?: string | null;
  sourceUrl?: string | null;
  sourceCategoryOriginal?: string | null;
  reason?: string;
};

export async function recommendStarterForMainDishAI({
  source,
  profile,
  situation,
  mainDish,
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation: Situation;
  mainDish: StarterMainDishAnchor;
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<unknown | null> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const request: ResponseCreateParamsNonStreaming = {
    model: getTwoStepModelForSource(source),
    input: [
      {
        role: "user",
        content: buildTwoStepSourceContent({
          prompt: buildStarterPrompt({
            profile,
            situation,
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

  if (!isRecord(parsed) || !("recommendation" in parsed)) {
    return null;
  }

  return parsed.recommendation ?? null;
}

function buildStarterPrompt({
  profile,
  situation,
  mainDish,
  targetLocale,
  targetLanguage
}: {
  profile: UserProfile;
  situation: Situation;
  mainDish: StarterMainDishAnchor;
  targetLocale: string;
  targetLanguage: string;
}) {
  return [
    "Du bist GustaroAI in der neuen 2+2-AI-Architektur.",
    "Du suchst genau eine passende Vorspeise oder Suppe fuer das angefragte bestaetigte Hauptgericht.",
    "Du extrahierst keinen kompletten Vorspeisenkatalog.",
    "Du darfst nichts erfinden.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    `translatedName muss in ${targetLanguage} (${targetLocale}) formuliert sein.`,
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Kopiere nameOriginal nicht einfach als translatedName, wenn der Originalname fremdsprachig ist.",
    "",
    "Bestaetigtes Hauptgericht als Pflichtanker:",
    JSON.stringify({ mainDish }),
    "",
    "Verbindliche Regeln:",
    "- Nutzerprofil und aktuelle Situation muessen beruecksichtigt werden.",
    "- Waehle hoechstens eine echte Vorspeise oder Suppe aus derselben Speisekarte.",
    "- Keine Hauptspeise, Beilage, Zutat, Kategorie oder Beschreibungsteil.",
    "- Nicht identisch oder nahezu identisch mit dem Hauptgericht.",
    "- Allergien, Unvertraeglichkeiten, Abneigungen und harte Profilregeln sind verbindliche Ausschluesse.",
    "- Wenn ein bekannter Konflikt mit dem Profil besteht: gib recommendation null zurueck.",
    "- Wenn bei Allergie oder Unvertraeglichkeit nicht sicher ausgeschlossen werden kann, dass die Vorspeise problematisch ist: gib recommendation null zurueck.",
    "- Wenn ein Risiko in einem gelieferten Ergebnis erkannt wird, muss profileSafety dies korrekt markieren.",
    "- Erfinde keine Belege. Kein typisches Rezeptwissen. Kein Text aus dem Hauptgericht.",
    "- Keine Zutaten, keine Beschreibungsteile und keine Hauptgerichte als Vorspeise.",
    "- sourceEvidence soll geliefert werden, wenn ein kurzer Beleg sicher moeglich ist.",
    "- sourceEvidence darf null oder fehlen, wenn kein knapper Beleg sicher angegeben werden kann.",
    "- priceRaw ist optional und darf null oder fehlen.",
    "- profileSafety ist Pflicht, wenn eine recommendation geliefert wird.",
    "- Wenn keine sichere Vorspeise existiert, gib recommendation null zurueck.",
    "",
    buildTwoStepProfileContext(profile, situation),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "recommendation": {',
    '    "targetMainDishRank": 1,',
    '    "targetMainDishNameOriginal": "Originalname des Hauptgerichts",',
    '    "nameOriginal": "exakter Originalname der Vorspeise",',
    '    "translatedName": "direkte nutzerseitige Uebersetzung in der Zielsprache",',
    '    "priceRaw": "Preis falls sichtbar, sonst null oder weglassen",',
    '    "sourceEvidence": "kurzer belegender Originalausschnitt aus der Speisekarte",',
    '    "sourceKind": "pdf | html | image | text | unknown",',
    '    "sourceUrl": "Quellen-URL falls bekannt, sonst null",',
    '    "sourceCategoryOriginal": "sichtbare Kategorie falls hilfreich, sonst null",',
    '    "pairingReason": "kurze profilbezogene Pairing-Begruendung in der Zielsprache",',
    '    "confidence": "high | medium | low",',
    '    "profileSafety": {',
    '      "hasKnownConflict": false,',
    '      "uncertainForAllergy": false,',
    '      "conflictReason": null',
    "    }",
    "  }",
    "}"
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
