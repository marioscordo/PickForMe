import { z } from "zod";
import {
  createTwoStepOpenAIClient,
  getLanguageNameForLocale,
  normalizeTargetLocale,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";

const RestaurantIntroAIResponseSchema = z.object({
  introText: z.string().trim().min(80)
});

export async function generateRestaurantIntroAI({
  restaurantName,
  sourceText,
  sourceUrl,
  outputLocale
}: {
  restaurantName?: string;
  sourceText: string;
  sourceUrl?: string;
  outputLocale?: string;
}) {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({ targetLocale, targetLanguage })
      },
      {
        role: "user",
        content: JSON.stringify({
          restaurantName: restaurantName?.trim() || null,
          sourceUrl: sourceUrl?.trim() || null,
          sourceText: sourceText.trim().slice(0, 12000)
        })
      }
    ]
  });

  const parsed = RestaurantIntroAIResponseSchema.parse(
    JSON.parse(stripJsonFence(completion.choices[0]?.message?.content ?? "{}"))
  );

  return parsed.introText.trim();
}

function buildSystemPrompt({
  targetLocale,
  targetLanguage
}: {
  targetLocale: string;
  targetLanguage: string;
}) {
  return [
    "Du schreibst fuer GustaroAI einen ausfuehrlichen On-demand-Text fuer den Bereich 'Ueber das Restaurant'.",
    "Das ist keine Speisekartenempfehlung und kein Ranking.",
    `Schreibe in ${targetLanguage} (${targetLocale}).`,
    "",
    "Ziel:",
    "- Stimme den Nutzer auf das Restaurant ein.",
    "- Schreibe kompakt, ehrlich, verlaesslich, einladend und source-grounded.",
    "- Der Text soll sich wie ein guter Concierge anfuehlen, nicht wie eine technische Zusammenfassung.",
    "- Laenge: ca. 15 bis 20 Zeilen, sofern die Quellenlage genug hergibt.",
    "",
    "Inhaltliche Leitplanken:",
    "- Beschreibe Kueche, Atmosphaere, Stil, Gastgebergefuehl, kulinarische Richtung und erkennbare Schwerpunkte.",
    "- Nutze ausschliesslich Informationen, die aus dem Quellenkontext ableitbar sind.",
    "- Erfinde keine Fakten, Auszeichnungen, Inhaber, Historie, Jahreszahlen, Qualitaetsversprechen oder Superlative.",
    "- Keine unbelegten Bewertungen und keine Werbeclaims.",
    "- Keine Gerichte empfehlen.",
    "- Keine Profil-, Allergie- oder Situationsentscheidung treffen.",
    "- Keine vollstaendige Speisekartenanalyse.",
    "- Wenn die Quellenlage duenn ist, formuliere vorsichtig und ehrlich.",
    "- Wenn etwas nur aus der Karte ableitbar ist, schreibe auch so vorsichtig: 'Die Karte deutet an ...' oder vergleichbar.",
    "- Wenn kein belastbarer Restaurantkontext erkennbar ist, gib einen neutralen, ehrlichen Einstimmungstext ohne Halluzination.",
    "",
    "Stil:",
    "- Fliesstext, keine Bulletpoints.",
    "- Natuerlich, warm, kompakt und praezise.",
    "- Keine trockene SEO-Zusammenfassung.",
    "- Keine Werbesprache und keine uebertriebenen Marketingwoerter.",
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "introText": "ausfuehrlicher source-grounded Restaurant-Einstimmungstext"',
    "}"
  ].join("\n");
}
