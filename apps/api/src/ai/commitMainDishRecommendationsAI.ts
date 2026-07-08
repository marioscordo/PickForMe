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
  MainDishCommitResponseSchema,
  type MainDishAIRecommendation,
  type MainDishCommitResult,
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";

export async function commitMainDishRecommendationsAI({
  source,
  profile,
  situation,
  recommendations,
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation: Situation;
  recommendations: MainDishAIRecommendation[];
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<MainDishCommitResult[]> {
  if (recommendations.length === 0) {
    return [];
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
          prompt: buildMainDishCommitPrompt({
            profile,
            situation,
            recommendations,
            targetLocale,
            targetLanguage
          }),
          source
        })
      }
    ]
  };

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  const parsed = MainDishCommitResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "{}")));

  return parsed.results;
}

function buildMainDishCommitPrompt({
  profile,
  situation,
  recommendations,
  targetLocale,
  targetLanguage
}: {
  profile: UserProfile;
  situation: Situation;
  recommendations: MainDishAIRecommendation[];
  targetLocale: string;
  targetLanguage: string;
}) {
  return [
    "Du bist der Main-Dish-Commit-Call fuer GustaroAI.",
    "Du bist Pruefer, nicht Empfehlender.",
    "Du darfst nicht neu empfehlen und keine Ersatzgerichte erfinden.",
    "Du darfst nur bestaetigen, ablehnen oder kleine Normalisierungen an den vorgeschlagenen Feldern vornehmen.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Pruefe jede vorgeschlagene Hauptspeise:",
    "- Existiert sie belegbar in der Speisekarte?",
    "- Ist sie ein eigenstaendiges Hauptgericht?",
    "- Ist sie keine Vorspeise, kein Dessert, kein Getraenk, keine Beilage, keine Zutat und kein Beschreibungsteil?",
    "- Ist sie profilkonform?",
    "- Ist sourceEvidence konkret und passend?",
    "- Ist translatedName plausibel und in der Ziel-/App-Sprache?",
    `- translatedName muss in ${targetLanguage} (${targetLocale}) formuliert sein.`,
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Wenn translatedName fehlt, leer, falschsprachig oder nur eine Kopie eines fremdsprachigen nameOriginal ist, aber Gericht und Evidence gueltig sind: korrigiere translatedName im committed Ergebnis.",
    "- translatedName-Korrektur ist eine Feldnormalisierung, keine neue Empfehlung.",
    "- Empfiehl keine Ersatzgerichte und tausche keine Hauptgerichte aus.",
    "- Wenn keine sichere Anzeigeuebersetzung aus sourceEvidence oder Speisekartentext moeglich ist, committed=false statt Halluzination.",
    "- Fehlender Preis ist kein Ablehnungsgrund.",
    "- low confidence darf nicht committed werden.",
    "- Bei Unsicherheit committed=false.",
    "",
    buildTwoStepProfileContext(profile, situation),
    "",
    "Zu pruefende Vorschlaege:",
    JSON.stringify({ recommendations }),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "results": [',
    "    {",
    '      "committed": true,',
    '      "rank": 1,',
    '      "nameOriginal": "bestaetigter Originalname",',
    '      "translatedName": "bestaetigte display-sichere Uebersetzung in der Zielsprache",',
    '      "priceRaw": "Preis falls sichtbar, sonst null oder weglassen",',
    '      "sourceEvidence": "konkreter Speisekartenbeleg",',
    '      "reason": "bestaetigte profilbezogene Begruendung",',
    '      "confidence": "high | medium"',
    "    },",
    "    {",
    '      "committed": false,',
    '      "rank": 2,',
    '      "nameOriginal": "optional Originalname",',
    '      "rejectionReason": "konkreter Ablehnungsgrund"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}
