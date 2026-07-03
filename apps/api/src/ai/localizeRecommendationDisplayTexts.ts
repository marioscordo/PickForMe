import OpenAI from "openai";
import { z } from "zod";
import type { Dish } from "../types/menu";
import type { Recommendation } from "../types/recommendations";

const LocalizedDisplayTextSchema = z.object({
  recommendations: z.array(z.object({
    dishId: z.string().min(1),
    translatedName: z.string().min(1)
  }))
});

type LocalizeRecommendationDisplayTextsInput = {
  dishes: Dish[];
  recommendations: Recommendation[];
  userLocale?: string;
};

type TranslationRequestItem = {
  dishId: string;
  nameOriginal: string;
  descriptionOriginal?: string;
  sourceLine?: string;
  category?: string;
  currentTranslatedName?: string;
};

export async function localizeRecommendationDisplayTexts({
  dishes,
  recommendations,
  userLocale
}: LocalizeRecommendationDisplayTextsInput): Promise<Recommendation[]> {
  if (recommendations.length === 0) {
    return recommendations;
  }

  const targetLocale = normalizeTargetLocale(userLocale);
  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));
  const requestItems = recommendations
    .map((recommendation): TranslationRequestItem | null => {
      const dish = dishesById.get(recommendation.dishId);

      if (!dish) {
        return null;
      }

      return {
        dishId: recommendation.dishId,
        nameOriginal: dish.nameOriginal,
        descriptionOriginal: dish.descriptionOriginal,
        sourceLine: dish.sourceLine,
        category: dish.category,
        currentTranslatedName: recommendation.translatedName
      };
    })
    .filter((item): item is TranslationRequestItem => Boolean(item));

  if (requestItems.length === 0) {
    return recommendations;
  }

  const existingTranslations = new Map(
    requestItems
      .filter((item) => isValidDishTranslation(item, item.currentTranslatedName, targetLocale))
      .map((item) => [item.dishId, item.currentTranslatedName!.trim()])
  );

  if (existingTranslations.size === requestItems.length) {
    return applyTranslations(recommendations, existingTranslations);
  }

  const translations = await requestDishDisplayTranslations({
    items: requestItems,
    targetLocale
  });

  return applyTranslations(recommendations, translations);
}

async function requestDishDisplayTranslations({
  items,
  targetLocale
}: {
  items: TranslationRequestItem[];
  targetLocale: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("RECOMMENDATION_TRANSLATION_FAILED");
  }

  const client = new OpenAI({ apiKey });
  const targetLanguage = getLanguageNameForLocale(targetLocale);

  for (const strictRetry of [false, true]) {
    try {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Translate selected restaurant dish names for the GustaroAI app.",
              `Target language: ${targetLanguage}.`,
              `Target locale: ${targetLocale}.`,
              "",
              "Context:",
              "- Every item is an already selected recommendation.",
              "- The selection, dishId, rank, order, price, and original dish name are final.",
              "- Your only task is the user-facing dish translation.",
              "",
              "Rules:",
              "- Return one translatedName for every dishId.",
              "- translatedName must be in the target language.",
              "- translatedName must translate or explain the original dish name as a restaurant dish.",
              "- Use descriptionOriginal, sourceLine, and category only to avoid mistranslation.",
              "- Preserve factual elements exactly: protein, cooking method, style, side dish, and preparation.",
              "- Never replace one protein with another.",
              "- Do not infer traditional ingredients from general culinary knowledge.",
              "- Do not add ingredients, prices, ratings, atmosphere, or recommendations.",
              "- Do not change dishId.",
              "- Do not translate nameOriginal itself; only provide translatedName.",
              "- Culinary proper names may remain, but translate style markers and add a concise target-language explanation when the menu context supports it.",
              "- Do not return translatedName identical to nameOriginal.",
              "- Do not use English unless the target language is English.",
              strictRetry
                ? "- The previous output was rejected. Provide real target-language dish translations now without changing facts."
                : "",
              "- Return only valid JSON."
            ].filter(Boolean).join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              recommendations: items.map((item) => ({
                dishId: item.dishId,
                nameOriginal: item.nameOriginal,
                descriptionOriginal: item.descriptionOriginal,
                sourceLine: item.sourceLine,
                category: item.category,
                currentTranslatedName: item.currentTranslatedName
              }))
            })
          }
        ]
      });

      const parsed = LocalizedDisplayTextSchema.parse(
        JSON.parse(stripJsonFence(completion.choices[0]?.message?.content ?? ""))
      );
      const translations = new Map(
        parsed.recommendations.map((item) => [item.dishId, item.translatedName.trim()])
      );

      assertValidTranslations(items, translations, targetLocale);

      return translations;
    } catch (error) {
      if (isRateLimitError(error)) {
        const retryDelayMs = getShortRetryDelayMs(error);

        if (retryDelayMs !== undefined) {
          await sleep(retryDelayMs);
          continue;
        }

        throw new Error("RECOMMENDATION_TRANSLATION_RATE_LIMIT");
      }
    }
  }

  throw new Error("RECOMMENDATION_TRANSLATION_FAILED");
}

function applyTranslations(recommendations: Recommendation[], translations: Map<string, string>) {
  return recommendations.map((recommendation) => ({
    ...recommendation,
    translatedName: translations.get(recommendation.dishId) ?? recommendation.translatedName
  }));
}

function assertValidTranslations(
  items: TranslationRequestItem[],
  translations: Map<string, string>,
  targetLocale: string
) {
  const invalidItems = items.filter((item) =>
    !isValidDishTranslation(item, translations.get(item.dishId), targetLocale)
  );

  if (invalidItems.length > 0) {
    throw new Error("RECOMMENDATION_TRANSLATION_FAILED");
  }
}

function isValidDishTranslation(
  item: TranslationRequestItem,
  translatedName: string | undefined,
  targetLocale: string
) {
  const value = translatedName?.trim();

  if (!value) {
    return false;
  }

  if (normalizeForTranslationCheck(value) === normalizeForTranslationCheck(item.nameOriginal)) {
    return false;
  }

  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode !== "en" && hasLikelyEnglishDisplayText(value)) {
    return false;
  }

  return !hasLikelyLambBeefTranslationConflict(item, value);
}

function hasLikelyEnglishDisplayText(value: string) {
  const normalized = ` ${value.toLowerCase().replace(/[^a-z]+/g, " ")} `;

  if (!normalized.trim()) {
    return false;
  }

  return [
    " a ",
    " an ",
    " and ",
    " baked ",
    " beef ",
    " braised ",
    " chicken ",
    " choice ",
    " dish ",
    " fillet ",
    " fish ",
    " fried ",
    " grilled ",
    " lamb ",
    " pork ",
    " roast ",
    " roasted ",
    " salmon ",
    " served ",
    " style ",
    " the ",
    " tuna ",
    " with "
  ].some((term) => normalized.includes(term));
}

function hasLikelyLambBeefTranslationConflict(item: TranslationRequestItem, value: string) {
  const source = normalizeForTranslationCheck([
    item.nameOriginal,
    item.descriptionOriginal,
    item.sourceLine
  ].filter(Boolean).join(" "));
  const output = normalizeForTranslationCheck(value);
  const sourceIsLamb = includesAny(source, ["abbacchio", "agnello", "lamb", "lamm"]);

  return sourceIsLamb && includesAny(output, ["rind", "beef"]);
}

function normalizeForTranslationCheck(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zäöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function normalizeTargetLocale(value: string | undefined) {
  const locale = value?.trim();

  return locale ? locale.slice(0, 40) : "de-DE";
}

function getLanguageNameForLocale(locale: string) {
  const languageCode = locale.toLowerCase().split(/[-_]/)[0];

  switch (languageCode) {
    case "de":
      return "German";
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "it":
      return "Italian";
    case "nl":
      return "Dutch";
    case "pl":
      return "Polish";
    case "pt":
      return "Portuguese";
    default:
      return locale;
  }
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function isRateLimitError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  const message = error instanceof Error ? error.message : "";

  return status === 429 ||
    message.includes("429") ||
    message.includes("Rate limit") ||
    message.includes("rate limit") ||
    message.includes("TPM");
}

function getShortRetryDelayMs(error: unknown) {
  const retryDelayMs = getRetryAfterDelayMs(error) ?? 1000;

  return retryDelayMs <= 3000 ? retryDelayMs : undefined;
}

function getRetryAfterDelayMs(error: unknown) {
  const headers = typeof error === "object" && error !== null && "headers" in error
    ? (error as { headers?: unknown }).headers
    : undefined;

  if (!headers || typeof (headers as { get?: unknown }).get !== "function") {
    return undefined;
  }

  const getHeader = (name: string) => (headers as { get: (name: string) => string | null }).get(name);
  const retryAfterMs = Number(getHeader("retry-after-ms"));

  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return retryAfterMs;
  }

  const retryAfterSeconds = Number(getHeader("retry-after"));

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
