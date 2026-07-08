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
  MainDishAIResponseSchema,
  type MainDishAIRecommendation,
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";

export async function recommendMainDishesAI({
  source,
  profile,
  situation,
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation: Situation;
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<MainDishAIRecommendation[]> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const request: ResponseCreateParamsNonStreaming = {
    model: getTwoStepModelForSource(source),
    input: [
      {
        role: "user",
        content: buildTwoStepSourceContent({
          prompt: buildMainDishPrompt({
            profile,
            situation,
            targetLocale,
            targetLanguage
          }),
          source
        })
      }
    ]
  };

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  const parsed = MainDishAIResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "{}")));

  return parsed.recommendations;
}

function buildMainDishPrompt({
  profile,
  situation,
  targetLocale,
  targetLanguage
}: {
  profile: UserProfile;
  situation: Situation;
  targetLocale: string;
  targetLanguage: string;
}) {
  return [
    "Du bist GustaroAI in der neuen 2+2-AI-Architektur.",
    "Du bist kein Speisekartenparser.",
    "Liefere nur die benoetigten Hauptgericht-Empfehlungen, nicht die komplette Speisekarte.",
    "Aufgabe: Waehle bis zu 3 passende echte Hauptspeisen aus der Speisekarte.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Verbindliche Regeln:",
    "- Nutzerprofil und aktuelle Situation muessen beruecksichtigt werden.",
    "- Gruende muessen profilbezogen sein.",
    "- Erfinde nichts.",
    "- Nutze nur Gerichte, die belegbar in der Speisekarte vorkommen.",
    "- Keine Vorspeisen, Desserts, Getraenke, Beilagen, Zutaten oder Beschreibungsteile.",
    "- Ein Gericht darf nicht wegen fehlendem Preis ausgeschlossen werden.",
    "- priceRaw ist optional und darf null oder fehlen.",
    "- sourceEvidence ist Pflicht fuer jede Empfehlung.",
    "- translatedName ist Pflicht und ist die nutzerseitige Anzeigeuebersetzung in der Zielsprache.",
    `- translatedName muss in ${targetLanguage} (${targetLocale}) formuliert sein.`,
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Kopiere nameOriginal nicht einfach als translatedName, wenn der Originalname fremdsprachig ist.",
    "- Eigennamen oder unveraenderliche Gerichtstitel duerfen teilweise erhalten bleiben, aber translatedName muss trotzdem in der Zielsprache verstaendlich sein.",
    "- Uebersetze nur, was durch sourceEvidence oder Speisekartentext belegbar ist.",
    "- Erfinde keine Zutaten und fuege keine freien Ausschmueckungen hinzu.",
    "- Wenn weniger als 3 sichere Hauptgerichte existieren, liefere weniger.",
    "",
    buildTwoStepProfileContext(profile, situation),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "nameOriginal": "exakter Originalname aus der Speisekarte",',
    '      "translatedName": "display-sichere nutzerseitige Anzeigeuebersetzung in der Zielsprache",',
    '      "priceRaw": "Preis falls sichtbar, sonst null oder weglassen",',
    '      "sourceEvidence": "kurzer belegender Originalausschnitt aus der Speisekarte",',
    '      "sourceKind": "pdf | html | image | text | unknown",',
    '      "sourceUrl": "Quellen-URL falls bekannt, sonst null",',
    '      "sourceCategoryOriginal": "sichtbare Kategorie falls hilfreich, sonst null",',
    '      "reason": "kurze profilbezogene Begruendung in der Zielsprache",',
    '      "confidence": "high | medium | low"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}
