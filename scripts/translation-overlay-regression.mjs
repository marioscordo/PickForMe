import fs from "node:fs";

function read(relativePath) {
  return fs.readFileSync(relativePath, "utf8").replace(/\r\n/g, "\n");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const route = read("apps/api/app/api/analyze-menu/route.ts");
const localizer = read("apps/api/src/ai/localizeRecommendationDisplayTexts.ts");

assert(
  localizer.includes("translatedDescription: z.string().min(1).nullable().optional()"),
  "display localization schema must include translatedDescription"
);
assert(
  localizer.includes("currentTranslatedDescription?: string;") &&
    localizer.includes("recommendation.translatedDescription"),
  "display localization input must carry the current translatedDescription"
);
assert(
  localizer.includes("currentTranslatedName: recommendation.translatedName") &&
    localizer.includes("currentTranslatedDescription: recommendation.translatedDescription"),
  "display localization must keep existing Main-AI translations as the first source"
);
assert(
  localizer.includes("- If descriptionOriginal is provided, return one translatedDescription for the same dishId.") &&
    localizer.includes("- translatedDescription must be in the target language and faithfully translate descriptionOriginal."),
  "display localization prompt must require translatedDescription when source description exists"
);
assert(
  localizer.includes("function isValidDisplayTranslation(") &&
    localizer.includes("function isValidDescriptionTranslation(") &&
    localizer.includes("function hasValidExistingDisplayText("),
  "display localization must validate names and descriptions together"
);
assert(
  localizer.includes("const translationsToRepair = requestItems.filter((item) => !existingTranslations.has(item.dishId));") &&
    localizer.includes("items: translationsToRepair") &&
    localizer.includes("const translations = new Map([...existingTranslations, ...repairedTranslations]);"),
  "display localization must repair only invalid or missing translations"
);
assert(
  !localizer.includes("refreshExistingTranslations"),
  "display localization must not expose a forced-refresh mode that overwrites valid Main-AI translations"
);

const twoStepStart = route.indexOf("async function analyzeMenuWithTwoStepMainFlow({");
const twoStepEnd = route.indexOf("\nfunction buildUncertainReviewResponse(", twoStepStart);
assert(twoStepStart >= 0 && twoStepEnd > twoStepStart, "two-step analyze function not found");
const twoStep = route.slice(twoStepStart, twoStepEnd);

const priceIndex = twoStep.indexOf("const mapped = await enrichPriceCompatibility({");
const allergyGateIndex = twoStep.indexOf("const allergySafeRecommendations = applyAllergySafetyGate({");
const localizationIndex = twoStep.indexOf("const localizedRecommendations = await localizeRecommendationsForPayload({");
const responseIndex = twoStep.indexOf("const response = NextResponse.json({");

assert(priceIndex >= 0, "two-step flow must keep price compatibility before localization");
assert(allergyGateIndex > priceIndex, "two-step flow must apply allergy safety after price compatibility");
assert(localizationIndex > allergyGateIndex, "two-step flow must localize only after final allergy safety");
assert(responseIndex > localizationIndex, "two-step flow must localize before serializing the response");
assert(
  twoStep.includes("recommendations: localizedRecommendations,"),
  "two-step response must return localized recommendations"
);
assert(
  !twoStep.includes("refreshExistingTranslations"),
  "two-step overlay must not force fresh localization of valid Main-AI translations"
);
assert(
  !twoStep.slice(priceIndex, localizationIndex).includes("localizeRecommendationsForPayload"),
  "two-step flow must not localize before price compatibility and allergy safety"
);

const localizeHelperStart = route.indexOf("async function localizeRecommendationsForPayload(");
const localizeHelperEnd = route.indexOf("\nfunction buildOrderLabelsForMenuLanguage(", localizeHelperStart);
assert(localizeHelperStart >= 0 && localizeHelperEnd > localizeHelperStart, "localizeRecommendationsForPayload helper not found");
const localizeHelper = route.slice(localizeHelperStart, localizeHelperEnd);

assert(
  localizeHelper.includes("if (isRecommendationTranslationFailure(error))") &&
    localizeHelper.includes('"ANALYSIS_NOT_SAFE"') &&
    localizeHelper.includes("SAFE_ANALYSIS_NOT_POSSIBLE_MESSAGE") &&
    localizeHelper.includes('attachAnalyzeOpsDiagnosticReason(controlledError, "recommendation_translation_failed")') &&
    localizeHelper.includes("throw controlledError;"),
  "known recommendation translation failures must fail closed as ANALYSIS_NOT_SAFE"
);
assert(
  localizeHelper.includes("return stripUnsafeRecommendationTranslations(input.recommendations, input.dishes, input.userLocale);"),
  "unexpected localization errors must keep the existing strip fallback"
);
assert(
  route.includes('message === "RECOMMENDATION_TRANSLATION_FAILED"') &&
    route.includes('message === "RECOMMENDATION_TRANSLATION_RATE_LIMIT"'),
  "only known recommendation translation failure codes should be treated as fail-closed"
);

console.log("translation-overlay-regression: passed");
