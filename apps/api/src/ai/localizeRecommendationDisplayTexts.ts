import OpenAI from "openai";
import { z } from "zod";
import { fingerprintDiagnosticText, logAnalyzeOpsDiagnostic } from "./twoStepRecommendationDiagnostics";
import type { Dish } from "../types/menu";
import type { Recommendation } from "../types/recommendations";

const LocalizedDisplayTextSchema = z.object({
  recommendations: z.array(z.object({
    dishId: z.string().min(1),
    translatedName: z.string().min(1),
    translatedDescription: z.string().min(1).nullable().optional()
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
  currentTranslatedDescription?: string;
};

type TranslationValidationFailureReason =
  | "translated_name_missing"
  | "translated_name_identical_to_original"
  | "translated_name_english_in_non_english_target"
  | "translated_name_lamb_beef_conflict"
  | "translated_description_unexpected"
  | "translated_description_missing"
  | "translated_description_identical_to_foreign_original"
  | "translated_description_english_in_non_english_target"
  | "translated_description_lamb_beef_conflict";

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
        currentTranslatedName: recommendation.translatedName,
        currentTranslatedDescription: recommendation.translatedDescription
      };
    })
    .filter((item): item is TranslationRequestItem => Boolean(item));

  if (requestItems.length === 0) {
    return recommendations;
  }

  const existingTranslations = new Map(
    requestItems
      .filter((item) => hasValidExistingDisplayText(item, targetLocale))
      .map((item) => [item.dishId, {
        translatedName: item.currentTranslatedName!.trim(),
        translatedDescription: normalizedExistingTranslatedDescription(item, targetLocale)
      }])
  );

  if (existingTranslations.size === requestItems.length) {
    return applyTranslations(recommendations, existingTranslations);
  }

  const translationsToRepair = requestItems.filter((item) => !existingTranslations.has(item.dishId));
  const repairedTranslations = await requestDishDisplayTranslations({
    items: translationsToRepair,
    targetLocale
  });
  const translations = new Map([...existingTranslations, ...repairedTranslations]);

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
              "Translate selected restaurant dish display texts for the GustaroAI app.",
              `Target language: ${targetLanguage}.`,
              `Target locale: ${targetLocale}.`,
              "",
              "Context:",
              "- Every item is an already selected recommendation.",
              "- The selection, dishId, rank, order, price, and original dish facts are final.",
              "- Your only task is the user-facing display translation.",
              "",
              "Rules:",
              "- Return one translatedName for every dishId.",
              "- If descriptionOriginal is provided, return one translatedDescription for the same dishId.",
              "- If descriptionOriginal is missing, return translatedDescription as null.",
              "- translatedName must be in the target language.",
              "- translatedDescription must be in the target language and faithfully translate descriptionOriginal.",
              "- translatedName must translate or explain the original dish name as a restaurant dish.",
              "- Use descriptionOriginal, sourceLine, and category only to avoid mistranslation.",
              "- Preserve factual elements exactly: protein, cooking method, style, side dish, and preparation.",
              "- Never replace one protein with another.",
              "- Do not infer traditional ingredients from general culinary knowledge.",
              "- Do not add ingredients, prices, ratings, atmosphere, or recommendations.",
              "- Do not change dishId.",
              "- Do not translate nameOriginal itself; only provide translatedName.",
              "- Do not translate sourceLine itself; only provide translatedDescription from descriptionOriginal.",
              "- Culinary proper names may remain, but translate style markers and add a concise target-language explanation when the menu context supports it.",
              "- Do not return translatedName identical to nameOriginal.",
              "- Do not return translatedDescription identical to a foreign-language descriptionOriginal.",
              "- Do not use English unless the target language is English.",
              strictRetry
                ? "- The previous output was rejected. Provide real target-language display translations now without changing facts."
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
                currentTranslatedName: item.currentTranslatedName,
                currentTranslatedDescription: item.currentTranslatedDescription
              }))
            })
          }
        ]
      });

      const parsed = LocalizedDisplayTextSchema.parse(
        JSON.parse(stripJsonFence(completion.choices[0]?.message?.content ?? ""))
      );
      const translations = new Map(
        parsed.recommendations.map((item) => [item.dishId, {
          translatedName: item.translatedName.trim(),
          translatedDescription: item.translatedDescription?.trim() || null
        }])
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

type DisplayTranslation = {
  translatedName: string;
  translatedDescription?: string | null;
};

function applyTranslations(recommendations: Recommendation[], translations: Map<string, DisplayTranslation>) {
  return recommendations.map((recommendation) => ({
    ...recommendation,
    translatedName: translations.get(recommendation.dishId)?.translatedName ?? recommendation.translatedName,
    ...buildTranslatedDescriptionPatch(recommendation, translations.get(recommendation.dishId))
  }));
}

function assertValidTranslations(
  items: TranslationRequestItem[],
  translations: Map<string, DisplayTranslation>,
  targetLocale: string
) {
  const invalidItems = items
    .map((item) => ({
      item,
      reason: getDisplayTranslationValidationFailureReason(item, translations.get(item.dishId), targetLocale)
    }))
    .filter((entry): entry is {
      item: TranslationRequestItem;
      reason: TranslationValidationFailureReason;
    } => Boolean(entry.reason));

  if (invalidItems.length > 0) {
    for (const { item, reason } of invalidItems) {
      const translation = translations.get(item.dishId);

      logAnalyzeOpsDiagnostic({
        phase: "recommendation_translation_validation_failed",
        targetLocale,
        dishId: item.dishId,
        reason,
        nameOriginalFp: fingerprintDiagnosticText(item.nameOriginal),
        translatedNameFp: fingerprintDiagnosticText(translation?.translatedName),
        descriptionOriginalFp: fingerprintDiagnosticText(item.descriptionOriginal),
        translatedDescriptionFp: fingerprintDiagnosticText(translation?.translatedDescription),
        sourceLineFp: fingerprintDiagnosticText(item.sourceLine),
        hasDescriptionOriginal: Boolean(item.descriptionOriginal?.trim()),
        hasTranslatedDescription: Boolean(translation?.translatedDescription?.trim())
      });
    }

    throw new Error("RECOMMENDATION_TRANSLATION_FAILED");
  }
}

function isValidDisplayTranslation(
  item: TranslationRequestItem,
  translation: DisplayTranslation | undefined,
  targetLocale: string
) {
  return !getDisplayTranslationValidationFailureReason(item, translation, targetLocale);
}

function getDisplayTranslationValidationFailureReason(
  item: TranslationRequestItem,
  translation: DisplayTranslation | undefined,
  targetLocale: string
): TranslationValidationFailureReason | null {
  return getDishTranslationValidationFailureReason(item, translation?.translatedName, targetLocale) ??
    getDescriptionTranslationValidationFailureReason(item, translation?.translatedDescription, targetLocale);
}

function isValidDishTranslation(
  item: TranslationRequestItem,
  translatedName: string | undefined,
  targetLocale: string
) {
  return !getDishTranslationValidationFailureReason(item, translatedName, targetLocale);
}

function getDishTranslationValidationFailureReason(
  item: TranslationRequestItem,
  translatedName: string | undefined,
  targetLocale: string
): TranslationValidationFailureReason | null {
  const value = translatedName?.trim();

  if (!value) {
    return "translated_name_missing";
  }

  if (normalizeForTranslationCheck(value) === normalizeForTranslationCheck(item.nameOriginal)) {
    return "translated_name_identical_to_original";
  }

  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode !== "en" && hasLikelyEnglishDisplayText(value)) {
    return "translated_name_english_in_non_english_target";
  }

  if (hasLikelyLambBeefTranslationConflict(item, value)) {
    return "translated_name_lamb_beef_conflict";
  }

  return null;
}

function hasValidExistingDisplayText(item: TranslationRequestItem, targetLocale: string) {
  if (!isValidDishTranslation(item, item.currentTranslatedName, targetLocale)) {
    return false;
  }

  return isValidDescriptionTranslation(
    item,
    normalizedExistingTranslatedDescription(item, targetLocale),
    targetLocale
  );
}

function normalizedExistingTranslatedDescription(item: TranslationRequestItem, targetLocale: string) {
  const current = item.currentTranslatedDescription?.trim();

  if (current) {
    return current;
  }

  const original = item.descriptionOriginal?.trim();

  if (original && isSameLanguageDescriptionAllowed(original, targetLocale)) {
    return original;
  }

  return null;
}

function buildTranslatedDescriptionPatch(
  recommendation: Recommendation,
  translation: DisplayTranslation | undefined
) {
  if (!translation || translation.translatedDescription === undefined) {
    return {};
  }

  if (!translation.translatedDescription) {
    return {};
  }

  return { translatedDescription: translation.translatedDescription };
}

function isValidDescriptionTranslation(
  item: TranslationRequestItem,
  translatedDescription: string | null | undefined,
  targetLocale: string
) {
  return !getDescriptionTranslationValidationFailureReason(item, translatedDescription, targetLocale);
}

function getDescriptionTranslationValidationFailureReason(
  item: TranslationRequestItem,
  translatedDescription: string | null | undefined,
  targetLocale: string
): TranslationValidationFailureReason | null {
  const descriptionOriginal = item.descriptionOriginal?.trim();
  const value = translatedDescription?.trim();

  if (!descriptionOriginal) {
    return value ? "translated_description_unexpected" : null;
  }

  if (!value) {
    return "translated_description_missing";
  }

  if (
    normalizeForTranslationCheck(value) === normalizeForTranslationCheck(descriptionOriginal) &&
    !isSameLanguageDescriptionAllowed(descriptionOriginal, targetLocale)
  ) {
    return "translated_description_identical_to_foreign_original";
  }

  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode !== "en" && hasLikelyEnglishDisplayText(value)) {
    return "translated_description_english_in_non_english_target";
  }

  if (hasLikelyLambBeefTranslationConflict(item, value)) {
    return "translated_description_lamb_beef_conflict";
  }

  return null;
}

function isSameLanguageDescriptionAllowed(value: string, targetLocale: string) {
  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode === "de") {
    return looksLikeGermanText(value);
  }

  if (targetLanguageCode === "en") {
    return looksLikeEnglishText(value);
  }

  return false;
}

function looksLikeGermanText(value: string) {
  const normalized = ` ${value.toLowerCase()} `;

  return /[äöüß]/i.test(value) ||
    /\b(?:mit|und|oder|vom|von|aus|dazu|serviert|gegrillt|gebacken|hausgemacht|frisch|sauce|soße|gemuese|gemüse|kartoffel|reis|salat|kaese|käse|zwiebeln)\b/i.test(normalized);
}

function looksLikeEnglishText(value: string) {
  const normalized = ` ${value.toLowerCase().replace(/[^a-z]+/g, " ")} `;

  return [
    " with ",
    " and ",
    " served ",
    " grilled ",
    " baked ",
    " fresh ",
    " sauce ",
    " salad ",
    " rice ",
    " potatoes ",
    " cheese ",
    " onions "
  ].some((term) => normalized.includes(term));
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
