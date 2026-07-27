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
  localizer.includes('phase: "recommendation_translation_validation_failed"') &&
    localizer.includes("reason,") &&
    localizer.includes("targetLocale,") &&
    localizer.includes("dishId: item.dishId"),
  "display localization must log validation failure reason, target locale and dish id"
);
assert(
  localizer.includes("fingerprintDiagnosticText(item.nameOriginal)") &&
    localizer.includes("fingerprintDiagnosticText(item.descriptionOriginal)") &&
    localizer.includes("fingerprintDiagnosticText(translation?.translatedName)") &&
    localizer.includes("fingerprintDiagnosticText(translation?.translatedDescription)"),
  "display localization diagnostics must fingerprint sensitive menu text instead of logging raw values"
);
const translationFailureLogStart = localizer.indexOf('phase: "recommendation_translation_validation_failed"');
const translationFailureLogEnd = localizer.indexOf("});", translationFailureLogStart);
const translationFailureLogBlock = localizer.slice(translationFailureLogStart, translationFailureLogEnd);
assert(
  translationFailureLogStart >= 0 &&
    !translationFailureLogBlock.includes("nameOriginal: item.nameOriginal") &&
    !translationFailureLogBlock.includes("descriptionOriginal: item.descriptionOriginal") &&
    !translationFailureLogBlock.includes("translatedName: translation?.translatedName") &&
    !translationFailureLogBlock.includes("translatedDescription: translation?.translatedDescription"),
  "display localization diagnostics must not log raw menu text in the validation failure block"
);
assert(
  localizer.includes('"translated_name_identical_to_original"') &&
    localizer.includes('"translated_name_english_in_non_english_target"') &&
    localizer.includes('"translated_description_missing"') &&
    localizer.includes('"translated_description_identical_to_foreign_original"') &&
    localizer.includes('"translated_description_lamb_beef_conflict"'),
  "display localization diagnostics must expose concrete validation failure reasons"
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

// Root cause (belegt 2026-07-27): localizeRecommendationDisplayTexts()
// respektiert die Main-AI-Uebersetzung bereits, scheitert aber am selben zu
// engen Sprach-Validierungs-Gate wie die Reparatur-AI (z.B. bereits deutsche
// Texte ohne Umlaut/aus der festen Wortliste, wie "vegetarisch"). Die
// Empfehlung (inkl. Safety-Verifier) ist zu diesem Zeitpunkt bereits fertig
// und sicher geprueft - RECOMMENDATION_TRANSLATION_FAILED/_RATE_LIMIT duerfen
// deshalb nicht mehr die ganze Analyse verwerfen (frueher: 422
// ANALYSIS_NOT_SAFE), sondern laufen wie jeder andere Uebersetzungsfehler
// ueber den bestehenden Strip-Fallback - nur unsichere Uebersetzungsfelder
// werden entfernt, die Empfehlung selbst bleibt sichtbar.
assert(
  !localizeHelper.includes("isRecommendationTranslationFailure") &&
    !localizeHelper.includes('"ANALYSIS_NOT_SAFE"'),
  "recommendation translation failures must no longer fail closed the whole analysis"
);
assert(
  localizeHelper.includes("return stripUnsafeRecommendationTranslations(input.recommendations, input.dishes, input.userLocale);"),
  "all localization errors (including RECOMMENDATION_TRANSLATION_FAILED/_RATE_LIMIT) must use the existing strip fallback"
);
assert(
  !route.includes("function isRecommendationTranslationFailure("),
  "the now-unused fail-closed classifier must not be left behind as dead code"
);

console.log("translation-overlay-regression: passed");
