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
  StarterCommitResponseSchema,
  type CommittedMainDishRecommendation,
  type StarterAIRecommendation,
  type StarterCommitResult,
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";

export async function commitStarterPairingAI({
  source,
  profile,
  situation,
  mainDish,
  starter,
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation: Situation;
  mainDish: CommittedMainDishRecommendation;
  starter: StarterAIRecommendation;
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<StarterCommitResult> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const request: ResponseCreateParamsNonStreaming = {
    model: getTwoStepModelForSource(source),
    input: [
      {
        role: "user",
        content: buildTwoStepSourceContent({
          prompt: buildStarterCommitPrompt({
            profile,
            situation,
            mainDish,
            starter,
            targetLocale,
            targetLanguage
          }),
          source
        })
      }
    ]
  };

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  const parsed = StarterCommitResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "{}")));

  return parsed.result;
}

function buildStarterCommitPrompt({
  profile,
  situation,
  mainDish,
  starter,
  targetLocale,
  targetLanguage
}: {
  profile: UserProfile;
  situation: Situation;
  mainDish: CommittedMainDishRecommendation;
  starter: StarterAIRecommendation;
  targetLocale: string;
  targetLanguage: string;
}) {
  return [
    "Du bist der Starter-Commit-Call fuer GustaroAI.",
    "Du bist Pruefer, nicht Empfehlender.",
    "Du darfst nicht neu empfehlen und keinen Ersatz erfinden.",
    "Bei Unsicherheit musst du ablehnen.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Bestaetigtes Hauptgericht:",
    JSON.stringify({ mainDish }),
    "",
    "Zu pruefende Vorspeise:",
    JSON.stringify({ starter }),
    "",
    "Pruefe:",
    "- Existiert die Vorspeise belegbar in der Speisekarte?",
    "- Ist sie eine eigenstaendige Vorspeise oder Suppe?",
    "- Ist sie keine Beilage, Zutat, Kategorie oder Beschreibungsteil?",
    "- Ist sie keine Hauptspeise?",
    "- Ist sie nicht identisch oder nahezu identisch mit dem Hauptgericht?",
    "- Ist sie profilkonform?",
    "- Ist sourceEvidence konkret und passend?",
    "- Ist translatedName plausibel?",
    "- Fehlender Preis ist kein Ablehnungsgrund.",
    "- low confidence darf nicht committed werden.",
    "",
    buildTwoStepProfileContext(profile, situation),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "result": {',
    '    "committed": true,',
    '    "targetMainDishNameOriginal": "Originalname des Hauptgerichts",',
    '    "nameOriginal": "bestaetigter Originalname der Vorspeise",',
    '    "translatedName": "bestaetigte Uebersetzung",',
    '    "priceRaw": "Preis falls sichtbar, sonst null oder weglassen",',
    '    "sourceEvidence": "konkreter Speisekartenbeleg",',
    '    "pairingReason": "bestaetigte Pairing-Begruendung",',
    '    "confidence": "high | medium"',
    "  }",
    "}",
    "",
    "Oder bei Ablehnung:",
    "{",
    '  "result": {',
    '    "committed": false,',
    '    "targetMainDishNameOriginal": "Originalname des Hauptgerichts",',
    '    "nameOriginal": "optional Originalname der abgelehnten Vorspeise",',
    '    "rejectionReason": "konkreter Ablehnungsgrund"',
    "  }",
    "}"
  ].join("\n");
}
