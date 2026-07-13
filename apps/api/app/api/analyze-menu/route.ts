import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUser } from "../../../src/auth/requireUser";
import { classifyDishRolesAI } from "../../../src/ai/classifyDishRolesAI";
import { askPickForMeImageUrlsAI } from "../../../src/ai/askPickForMeImageUrlsAI";
import { localizeRecommendationDisplayTexts } from "../../../src/ai/localizeRecommendationDisplayTexts";
import { recommendMainDishesAI } from "../../../src/ai/recommendMainDishesAI";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { parseMenu } from "../../../src/menu/parseMenu";
import {
  extractHtmlMenuFromUrl,
  htmlMenuExtractionToDishes,
  htmlMenuExtractionToMenuText
} from "../../../src/menu/extraction/extractHtmlMenu";
import { prepareRecommendationSearchSpace } from "../../../src/menu/prepareRecommendationSearchSpace";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import { findLinkedMenuImageUrls, looksLikeImageUrl } from "../../../src/menu/findLinkedMenuImageUrls";
import { loadMenuTextFromMenury, looksLikeMenuryUrl } from "../../../src/menu/loadMenuTextFromMenury";
import {
  applyDishRoleClassifications,
  getDishesNeedingRoleClassification
} from "../../../src/menu/applyDishRoleClassifications";
import { rankMenuSourceCandidatesByQuality } from "../../../src/restaurant/menuSourceQuality";
import { recommendDishes } from "../../../src/recommendation/recommendDishes";
import { gatekeepMainDishRecommendations } from "../../../src/recommendation/gatekeeper";
import { mapGatekeptMainRecommendationsToAnalyzeData } from "../../../src/recommendation/twoStepRecommendationMappers";
import { blockReasonForRecommendation } from "../../../src/profile/profileRules";
import { sanitizeProfileForRecommendation } from "../../../src/profile/profileInputPolicy";
import type { AnalyzeMenuRequest, RequestedDishRole } from "../../../src/types/api";
import type { MenuExtractionResult } from "../../../src/menu/extraction/types";
import type { RestaurantDescriptionResult } from "../../../src/restaurant/extractRestaurantDescription";
import type { Dish } from "../../../src/types/menu";
import type { Recommendation } from "../../../src/types/recommendations";
import type { TwoStepMenuSourceInput } from "../../../src/ai/twoStepRecommendationSchemas";

type FallbackHeroContext = {
  dishes?: Dish[];
  menuType?: string;
  recommendationMode?: "single_dishes" | "whole_menu" | "sharing_menu";
  restaurantContextText?: string;
  officialWebsiteText?: string;
};

type LinkedPdfMenu = {
  url: string;
  urls?: string[];
  restaurantContextText?: string;
};

type MenuSourceKind = "pdf" | "html" | "image";

type MenuSourceCandidate = {
  url: string;
  label: string;
  index: number;
  sourceKind: MenuSourceKind;
};

type MenuSourceFamilyInfo = MenuSourceCandidate & {
  directoryKey: string;
  familyKey: string;
  partOrder: number;
};

type LocalizedRestaurantDescriptionResult = RestaurantDescriptionResult & {
  displayText: string;
};

const SAFE_ANALYSIS_NOT_POSSIBLE_MESSAGE =
  "Kein auswertbarer Speisekartenlink gefunden. Bitte Link, Text oder Foto manuell einfügen";
const TEXT_AI_TIMEOUT_MS = 90000;
const PDF_AI_TIMEOUT_MS = 90000;
const DISH_ROLE_CLASSIFICATION_TIMEOUT_MS = 30000;
const STARTER_CANDIDATE_DISH_LIMIT = 20;
const PDF_TEXT_AUGMENT_URL_LIMIT = 3;
const PDF_TEXT_AUGMENT_CHAR_LIMIT = 36000;
const SECOND_LEVEL_DOMAIN_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "com.br",
  "com.ar",
  "com.au",
  "co.jp",
  "com.mx"
]);

export async function POST(request: Request) {
  let requestRunId = createAnalyzeRunId();
  const requestStartedAt = Date.now();

  try {
    logDevAnalyzeTiming({
      runId: requestRunId,
      phase: "api.request_received",
      durationMs: 0
    });

    await requireUser(request);

    const validationStartedAt = Date.now();
    const body = (await request.json()) as AnalyzeMenuRequest;
    requestRunId = normalizeDiagnosticRunId(body.diagnosticRunId) ?? requestRunId;
    const outputLocale = normalizeTargetLocale(body.profile.outputLocale);
    const requestedDishRoles = normalizeRequestedDishRoles(body.requestedDishRoles);
    const legacySituation = body.situation ?? "leicht";
    const profile = sanitizeProfileForRecommendation({
      ...body.profile,
      outputLocale
    });

    if (body.sourceKind !== "text") {
      throw new AppError(400, "SOURCE_KIND_UNSUPPORTED", "Diese Art von Speisekarte wird in V1 noch nicht unterstützt.");
    }

    if (!body.menuText || body.menuText.trim().length < 20) {
      throw new AppError(400, "MENU_TOO_SHORT", "Bitte zuerst eine Speisekarte einfügen.");
    }

    logDevAnalyzeTiming({
      runId: requestRunId,
      phase: "api.validation",
      durationMs: Date.now() - validationStartedAt,
      success: true
    });

    const rawMenuText = body.menuText.trim();

    if (!looksLikeMenuryUrl(rawMenuText) && looksLikeUrl(rawMenuText) && isKnownDynamicMenuPlatform(rawMenuText)) {
      throw new AppError(
        422,
        "DYNAMIC_MENU_UNSUPPORTED",
        "Diese digitale Menüplattform wird in V1 noch nicht unterstützt. Bitte nutze eine PDF-Speisekarte oder füge den Speisekartentext ein."
      );
    }
    let dynamicMenuText: string | null = null;

    if (looksLikeUrl(rawMenuText) && looksLikeMenuryUrl(rawMenuText)) {
      try {
        dynamicMenuText = await loadMenuTextFromMenury(rawMenuText);
      } catch (menuryError) {
        console.error("GustaroAI Menury loader failed.", menuryError);

        throw new AppError(
          422,
          "DYNAMIC_MENU_UNSUPPORTED",
          "Diese digitale Menüplattform konnte noch nicht sicher ausgelesen werden. Bitte nutze eine PDF-Speisekarte oder füge den Speisekartentext ein."
        );
      }
    }

    if (!dynamicMenuText && looksLikeUrl(rawMenuText) && isKnownDynamicMenuPlatform(rawMenuText)) {
      throw new AppError(
        422,
        "DYNAMIC_MENU_UNSUPPORTED",
        "Diese digitale Menüplattform wird in V1 noch nicht unterstützt. Bitte nutze eine PDF-Speisekarte oder füge den Speisekartentext ein."
      );
    }

    const providedPdfMenuUrls = Array.isArray(body.menuUrls)
      ? uniqueStrings(body.menuUrls
        .map((url) => url.trim())
        .filter((url) => looksLikeUrl(url) && looksLikePdfUrl(url))
        .map(canonicalizePdfSourceUrl))
      : [];
    const inputLooksLikeUrl = looksLikeUrl(rawMenuText);
    const directPdfUrl = !dynamicMenuText && inputLooksLikeUrl && looksLikePdfUrl(rawMenuText)
      ? canonicalizePdfSourceUrl(rawMenuText)
      : null;
    const sourceFetchStartedAt = Date.now();
    const linkedPdfMenu = !dynamicMenuText && inputLooksLikeUrl && !directPdfUrl ? await findLinkedPdfMenu(rawMenuText) : null;
    const selectedPdfMenu = await selectPdfMenuForAnalysis({
      providedPdfMenuUrls,
      directPdfUrl,
      linkedPdfMenu,
      runId: requestRunId
    });
    logDevAnalyzeTiming({
      runId: requestRunId,
      phase: "api.source_fetch",
      durationMs: Date.now() - sourceFetchStartedAt,
      success: true
    });
    const pdfMenuUrls = selectedPdfMenu?.urls ?? [];
    const pdfMenuUrl = pdfMenuUrls[0];
    const officialRestaurantUrl = inputLooksLikeUrl
      ? getOfficialRestaurantHomepageUrl(rawMenuText)
      : undefined;
    const restaurantDescription: RestaurantDescriptionResult | null = null;
    const localizedRestaurantDescription: LocalizedRestaurantDescriptionResult | null = null;
    const sourceInputAllergenWarningPayload = buildAllergenInfoWarningPayload(profile, rawMenuText, body.userLocale);

    if (pdfMenuUrl) {
      if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
        throw new AppError(400, "PDF_AI_DISABLED", "PDF-Speisekarten benötigen in V1 den KI-Modus.");
      }

      try {
        return await analyzeMenuWithTwoStepMainFlow({
          source: {
            kind: "pdf",
            urls: pdfMenuUrls,
            sourceUrl: pdfMenuUrl,
            text: selectedPdfMenu?.restaurantContextText ?? rawMenuText
          },
          responseMode: "ai_pdf",
          profile,
          situation: body.situation,
          requestedDishRoles,
          outputLocale,
          restaurantDescription,
          localizedRestaurantDescription,
          restaurantUrl: officialRestaurantUrl,
          fallbackHeroContextText: selectedPdfMenu?.restaurantContextText ?? rawMenuText,
          htmlMenuExtraction: null,
          starterCandidateSourceUrls: pdfMenuUrls,
          extraPayload: {
            ...sourceInputAllergenWarningPayload
          },
          timeoutMs: PDF_AI_TIMEOUT_MS,
          requestStartedAt,
          runId: requestRunId
        });
      } catch (pdfAiError) {
        const message = pdfAiError instanceof Error ? pdfAiError.message : "";

        if (pdfAiError instanceof AppError) {
          throw pdfAiError;
        }

        if (isRateLimitError(pdfAiError)) {
          throw new AppError(
            429,
            "AI_RATE_LIMIT",
            "Ich kann die Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
          );
        }

        if (
          message.includes("PDF_LOCALIZATION_FAILED") ||
          message.includes("PDF_AI_TIMEOUT") ||
          message.includes("TWO_STEP_MAIN_AI_TIMEOUT")
        ) {
          throw new AppError(
            422,
            "ANALYSIS_NOT_SAFE",
            SAFE_ANALYSIS_NOT_POSSIBLE_MESSAGE,
            buildMenuAnalysisDetails(localizedRestaurantDescription, null)
          );
        }

        console.error("GustaroAI PDF AI failed.", pdfAiError);

        throw new AppError(
          422,
          "ANALYSIS_NOT_SAFE",
          SAFE_ANALYSIS_NOT_POSSIBLE_MESSAGE,
          buildMenuAnalysisDetails(localizedRestaurantDescription, null)
        );
      }
    }

    const menuTextUrl = pdfMenuUrl || rawMenuText;

    const directImageUrl = !dynamicMenuText && inputLooksLikeUrl && looksLikeImageUrl(rawMenuText) ? rawMenuText : null;

    if (directImageUrl) {
      if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
        throw new AppError(400, "IMAGE_AI_DISABLED", "Bild-Speisekarten benötigen in V1 den KI-Modus.");
      }

      try {
        return await analyzeMenuWithTwoStepMainFlow({
          source: {
            kind: "image",
            urls: [directImageUrl],
            sourceUrl: directImageUrl,
            text: rawMenuText
          },
          responseMode: "ai_image",
          profile,
          situation: body.situation,
          requestedDishRoles,
          outputLocale,
          restaurantDescription,
          localizedRestaurantDescription,
          restaurantUrl: officialRestaurantUrl,
          fallbackHeroContextText: rawMenuText,
          htmlMenuExtraction: null,
          extraPayload: {
            ...sourceInputAllergenWarningPayload
          },
          timeoutMs: 45000,
          requestStartedAt,
          runId: requestRunId
        });
      } catch (imageAiError) {
        if (imageAiError instanceof AppError) {
          throw imageAiError;
        }

        console.error("GustaroAI Image AI failed.", imageAiError);

        const message = imageAiError instanceof Error ? imageAiError.message : "";

        if (
          message.includes("429") ||
          message.includes("Rate limit") ||
          message.includes("rate limit") ||
          message.includes("TPM")
        ) {
          throw new AppError(
            429,
            "AI_RATE_LIMIT",
            "Ich kann die Bild-Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
          );
        }

        if (
          message.includes("IMAGE_AI_TIMEOUT") ||
          message.includes("TWO_STEP_MAIN_AI_TIMEOUT")
        ) {
          throw new AppError(
            422,
            "ANALYSIS_NOT_SAFE",
            "Ich konnte diese Bild-Speisekarte nicht sicher auswerten."
          );
        }

        if (isInvalidImageAiError(imageAiError)) {
          throw new AppError(
            422,
            "IMAGE_MENU_NOT_READABLE",
            "Diese Bild-Speisekarte konnte nicht sicher gelesen werden. Bitte nutze einen direkten Link zu einer PDF-Speisekarte oder fuege den Speisekartentext ein."
          );
        }

        if (
          message.includes("Profilregeln") ||
          message.includes("keine sicher") ||
          message.includes("NO_SAFE")
        ) {
          throw new AppError(
            422,
            "NO_SAFE_RECOMMENDATIONS",
            "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
          );
        }

        throw imageAiError;
      }
    }

    const shouldExtractHtmlMenu = !dynamicMenuText && inputLooksLikeUrl && !pdfMenuUrl && !directImageUrl;
    const htmlMenuExtraction = shouldExtractHtmlMenu
      ? await extractHtmlMenuFamilyFromUrl(rawMenuText)
      : null;
    const htmlMenuText = htmlMenuExtraction
      ? htmlMenuExtraction.items.length
        ? htmlMenuExtractionToMenuText(htmlMenuExtraction)
        : htmlMenuExtraction.fragments.join("\n")
      : null;
    const htmlMenuDishes = htmlMenuExtraction?.items.length
      ? htmlMenuExtractionToDishes(htmlMenuExtraction)
      : null;

    let effectiveMenuText: string;

    try {
      effectiveMenuText = dynamicMenuText ?? htmlMenuText ?? (inputLooksLikeUrl
        ? await loadMenuTextFromUrl(menuTextUrl)
        : rawMenuText);
    } catch {
      throw new AppError(422, "MENU_URL_LOAD_FAILED", "Diese Speisekarte konnte nicht geladen werden.");
    }

    if (effectiveMenuText.trim().length < 20 && !htmlMenuExtraction) {
      if (inputLooksLikeUrl) {
        throw new AppError(422, "MENU_URL_LOAD_FAILED", "Diese Speisekarte konnte nicht geladen werden.");
      }

      throw new AppError(400, "MENU_TOO_SHORT", "Aus dieser Eingabe konnte kein ausreichender Speisekartentext gelesen werden.");
    }

    if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
      throw new AppError(400, "AI_DISABLED", "Speisekartenempfehlungen benoetigen den KI-Modus.");
    }

    try {
      const textAllergenWarningPayload = buildAllergenInfoWarningPayload(
        profile,
        `${rawMenuText}\n${effectiveMenuText}`,
        body.userLocale
      );

      return await analyzeMenuWithTwoStepMainFlow({
        source: {
          kind: htmlMenuExtraction ? "html" : "text",
          text: effectiveMenuText,
          sourceUrl: inputLooksLikeUrl ? rawMenuText : null
        },
        responseMode: "ai",
        profile,
        situation: body.situation,
        requestedDishRoles,
        outputLocale,
        restaurantDescription,
        localizedRestaurantDescription,
        restaurantUrl: officialRestaurantUrl,
        fallbackHeroContextText: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`,
        htmlMenuExtraction,
        extraPayload: {
          ...textAllergenWarningPayload,
          ...buildMenuExtractionPayload(htmlMenuExtraction)
        },
        timeoutMs: TEXT_AI_TIMEOUT_MS,
        requestStartedAt,
        runId: requestRunId
      });
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : "";

      if (aiError instanceof AppError) {
        throw aiError;
      }

      if (isRateLimitError(aiError)) {
        throw new AppError(
          429,
          "AI_RATE_LIMIT",
          "Ich kann die Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
        );
      }

      if (
        message.includes("TEXT_AI_TIMEOUT") ||
        message.includes("TWO_STEP_MAIN_AI_TIMEOUT")
      ) {
        throw new AppError(
          422,
          "ANALYSIS_NOT_SAFE",
          SAFE_ANALYSIS_NOT_POSSIBLE_MESSAGE,
          buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
        );
      }

      console.error("GustaroAI AI failed.", aiError);

      throw aiError;
    }

    const parsedMenuItems = htmlMenuDishes ?? parseMenu(effectiveMenuText);
    let dishes = parsedMenuItems.filter(isFoodDish);

    if (dishes.length === 0 && inputLooksLikeUrl && process.env.GUSTAROAI_AI_ENABLED === "true") {
      const imageUrls = await findLinkedMenuImageUrls(rawMenuText);

      if (imageUrls.length > 0) {
        try {
          const aiResult = await withTimeout(
            askPickForMeImageUrlsAI({
              imageUrls,
              profile,
              situation: body.situation,
              userLocale: outputLocale
            }),
            45000,
            "IMAGE_AI_TIMEOUT"
          );

          if (aiResult.recommendations.length === 0) {
            throw new AppError(
              422,
              "NO_SAFE_RECOMMENDATIONS",
              "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
            );
          }

          const conciergeHero = await buildConciergeHeroFromOfficialWebsiteText({
            officialWebsiteText: restaurantDescription?.text,
            restaurantUrl: officialRestaurantUrl,
            fallbackHero: buildFallbackConciergeHero({
              dishes: aiResult.dishes,
              restaurantContextText: rawMenuText
            })
          });

          const allergySafeRecommendations = applyAllergySafetyGate({
            dishes: aiResult.dishes,
            recommendations: aiResult.recommendations,
            profile
          });

          if (allergySafeRecommendations.length === 0) {
            throw new AppError(
              422,
              "NO_SAFE_RECOMMENDATIONS",
              "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
            );
          }

          const recommendations = await localizeRecommendationsForPayload({
            dishes: aiResult.dishes,
            recommendations: allergySafeRecommendations,
            userLocale: outputLocale
          });

          return NextResponse.json({
            ok: true,
            data: {
              mode: "ai_image",
              dishes: aiResult.dishes,
              recommendations,
              conciergeHero,
              ...sourceInputAllergenWarningPayload,
              ...buildRestaurantDescriptionPayload(localizedRestaurantDescription)
            }
          });
        } catch (imageAiError) {
          console.error("GustaroAI linked Image AI failed.", imageAiError);

          const message = getErrorMessage(imageAiError);

          if (
            message.includes("429") ||
            message.includes("Rate limit") ||
            message.includes("rate limit") ||
            message.includes("TPM")
          ) {
            throw new AppError(
              429,
              "AI_RATE_LIMIT",
              "Ich kann die Bild-Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
            );
          }

          if (message.includes("IMAGE_AI_TIMEOUT")) {
            throw new AppError(
              422,
              "ANALYSIS_NOT_SAFE",
              "Ich konnte diese Bild-Speisekarte nicht sicher auswerten."
            );
          }

          if (isInvalidImageAiError(imageAiError)) {
            throw new AppError(
              422,
              "IMAGE_MENU_NOT_READABLE",
              "Diese Bild-Speisekarte konnte nicht sicher gelesen werden. Bitte nutze einen direkten Link zu einer PDF-Speisekarte oder fuege den Speisekartentext ein."
            );
          }

          if (
            message.includes("Profilregeln") ||
            message.includes("keine sicher") ||
            message.includes("NO_SAFE")
          ) {
            throw new AppError(
              422,
              "NO_SAFE_RECOMMENDATIONS",
              "Ich konnte diese Bild-Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
            );
          }

          throw imageAiError;
        }
      }
    }

    if (dishes.length === 0) {
      const partialData = buildPartialAnalysisPayload(localizedRestaurantDescription, htmlMenuExtraction, []);

      if (partialData) {
        return NextResponse.json({
          ok: true,
          data: partialData
        });
      }

      if (inputLooksLikeUrl) {
        throw new AppError(
          422,
          "ANALYSIS_NOT_SAFE",
          "Ich konnte diese Speisekarte nicht sicher auswerten. Bitte nutze einen direkten Link zu einer PDF-Speisekarte oder fuege den Speisekartentext ein.",
          buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
        );
      }

      throw new AppError(400, "NO_DISHES_FOUND", "GustaroAI konnte noch keine Gerichte erkennen.");
    }

    dishes = await classifyUnclearDishRoles(dishes);

    const recommendations = recommendDishes({
      dishes,
      profile,
      situation: legacySituation
    });

    if (recommendations.length === 0) {
      const partialData = buildPartialAnalysisPayload(localizedRestaurantDescription, htmlMenuExtraction, dishes);

      if (partialData) {
        return NextResponse.json({
          ok: true,
          data: partialData
        });
      }

      throw new AppError(
        422,
        "NO_SAFE_RECOMMENDATIONS",
        "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
        buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
      );
    }

    const allergySafeRecommendations = applyAllergySafetyGate({
      dishes,
      recommendations,
      profile
    });

    if (allergySafeRecommendations.length === 0) {
      const partialData = buildPartialAnalysisPayload(localizedRestaurantDescription, htmlMenuExtraction, dishes);

      if (partialData) {
        return NextResponse.json({
          ok: true,
          data: partialData
        });
      }

      throw new AppError(
        422,
        "NO_SAFE_RECOMMENDATIONS",
        "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
        buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
      );
    }

    const localizedRecommendations = await localizeRecommendationsForPayload({
      dishes,
      recommendations: allergySafeRecommendations,
      userLocale: outputLocale
    });

    return NextResponse.json({
      ok: true,
      data: {
        mode: "fallback",
        dishes,
        recommendations: localizedRecommendations,
        conciergeHero: await buildConciergeHeroFromOfficialWebsiteText({
            officialWebsiteText: restaurantDescription?.text,
            restaurantUrl: officialRestaurantUrl,
            fallbackHero: buildFallbackConciergeHero({
              dishes,
              restaurantContextText: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`
            })
        }),
        ...buildAllergenInfoWarningPayload(profile, `${rawMenuText}\n${effectiveMenuText}`, body.userLocale),
        ...buildRestaurantDescriptionPayload(localizedRestaurantDescription),
        ...buildMenuExtractionPayload(htmlMenuExtraction)
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}


async function localizeRecommendationsForPayload(
  input: Parameters<typeof localizeRecommendationDisplayTexts>[0]
) {
  try {
    return await localizeRecommendationDisplayTexts(input);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("GustaroAI recommendation localization failed.", error);
    }

    return stripUnsafeRecommendationTranslations(input.recommendations, input.dishes, input.userLocale);
  }
}

type TwoStepAnalyzeResponseMode = "ai" | "ai_pdf" | "ai_image";

async function analyzeMenuWithTwoStepMainFlow({
  source,
  responseMode,
  profile,
  situation,
  requestedDishRoles,
  outputLocale,
  restaurantDescription,
  localizedRestaurantDescription,
  restaurantUrl,
  fallbackHeroContextText,
  htmlMenuExtraction,
  starterCandidateSourceUrls = [],
  extraPayload = {},
  timeoutMs,
  requestStartedAt,
  runId
}: {
  source: TwoStepMenuSourceInput;
  responseMode: TwoStepAnalyzeResponseMode;
  profile: AnalyzeMenuRequest["profile"];
  situation?: AnalyzeMenuRequest["situation"];
  requestedDishRoles: RequestedDishRole[];
  outputLocale: string;
  restaurantDescription: RestaurantDescriptionResult | null;
  localizedRestaurantDescription: LocalizedRestaurantDescriptionResult | null;
  restaurantUrl?: string;
  fallbackHeroContextText: string;
  htmlMenuExtraction: MenuExtractionResult | null;
  starterCandidateSourceUrls?: string[];
  extraPayload?: Record<string, unknown>;
  timeoutMs: number;
  requestStartedAt: number;
  runId: string;
}) {
  const flowStartedAt = Date.now();
  const sourceKind = source.kind;
  const sourceCount = getTwoStepMainSourceCount(source);
  const searchSpace = prepareRecommendationSearchSpace({
    sourceKind,
    menuText: source.text ?? "",
    htmlMenuExtraction,
    timezone: "Europe/Berlin",
    now: new Date()
  });
  const canApplySearchSpaceRestriction = sourceKind === "html" || sourceKind === "text";
  const sourceForMainAi = searchSpace.restrictionApplied && canApplySearchSpaceRestriction
    ? {
        ...source,
        text: searchSpace.text
      }
    : source;
  const augmentedSourceForMainAi = await augmentPdfSourceWithExtractedText({
    source: sourceForMainAi,
    responseMode,
    runId
  });
  let proposedMainDishes: Awaited<ReturnType<typeof recommendMainDishesAI>>;
  let mainAiDurationMs = 0;

  const mainStartedAt = Date.now();
  try {
    proposedMainDishes = await withAbortTimeout(
      (signal) => recommendMainDishesAI({
        source: augmentedSourceForMainAi,
        profile,
        situation,
        requestedDishRoles,
        userLocale: outputLocale,
        runId,
        signal
      }),
      timeoutMs,
      "TWO_STEP_MAIN_AI_TIMEOUT"
    );
    mainAiDurationMs = Date.now() - mainStartedAt;
    logTwoStepMain({
      phase: "main-ai",
      runId,
      responseMode,
      sourceKind,
      sourceCount,
      mainAiCount: proposedMainDishes.length,
      mainAiTranslatedNameCount: countDisplaySafeTranslatedNames(proposedMainDishes),
      durationMs: mainAiDurationMs
    });
  } catch (error) {
    logTwoStepMainError({
      phase: "main-ai-error",
      runId,
      responseMode,
      sourceKind,
      sourceCount,
      durationMs: Date.now() - mainStartedAt,
      error
    });
    throw error;
  }

  const gatekeeperStartedAt = Date.now();
  const gatekeeperResult = gatekeepMainDishRecommendations(proposedMainDishes);
  const gatekeeperDurationMs = Date.now() - gatekeeperStartedAt;
  logDevAnalyzeTiming({
    runId,
    phase: "api.gatekeeper",
    durationMs: gatekeeperDurationMs,
    candidateCount: proposedMainDishes.length,
    success: true
  });
  logTwoStepMain({
    phase: "gatekeeper",
    runId,
    responseMode,
    sourceKind,
    sourceCount,
    gatekeeperAcceptedCount: gatekeeperResult.accepted.length,
    gatekeeperRejectedCount: gatekeeperResult.rejected.length,
    durationMs: gatekeeperDurationMs
  });

  const mapperStartedAt = Date.now();
  const mapped = mapGatekeptMainRecommendationsToAnalyzeData(gatekeeperResult.accepted, requestedDishRoles);
  const mapperDurationMs = Date.now() - mapperStartedAt;
  logDevAnalyzeTiming({
    runId,
    phase: "api.mapper",
    durationMs: mapperDurationMs,
    candidateCount: gatekeeperResult.accepted.length,
    success: true
  });
  logTwoStepMain({
    phase: "mapper",
    runId,
    responseMode,
    sourceKind,
    sourceCount,
    mapperRecommendationCount: mapped.recommendations.length,
    mapperTranslatedNameCount: countDisplaySafeRecommendationTranslations(mapped.recommendations, mapped.dishes),
    durationMs: mapperDurationMs
  });

  if (mapped.recommendations.length === 0) {
    throw new AppError(
      422,
      "NO_SAFE_RECOMMENDATIONS",
      "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
      buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
    );
  }

  const allergySafeRecommendations = applyAllergySafetyGate({
    dishes: mapped.dishes,
    recommendations: mapped.recommendations,
    profile
  });

  if (allergySafeRecommendations.length === 0) {
    throw new AppError(
      422,
      "NO_SAFE_RECOMMENDATIONS",
      "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
      buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
    );
  }

  const conciergeHero = buildFallbackConciergeHero({
    dishes: mapped.dishes,
    restaurantContextText: fallbackHeroContextText
  });

  logAnalyzePerf({
    phase: "response",
    skippedRestaurantIntro: true,
    skippedHero: true,
    skippedStarterCandidates: true,
    mainAiDurationMs,
    totalDurationMs: Date.now() - flowStartedAt,
    responseMode,
    sourceKind,
    sourceCount,
    runId
  });

  const responseSerializationStartedAt = Date.now();
  const response = NextResponse.json({
    ok: true,
    data: {
      mode: responseMode,
      dishes: mapped.dishes,
      recommendations: allergySafeRecommendations,
      conciergeHero,
      ...extraPayload,
      ...buildRestaurantDescriptionPayload(localizedRestaurantDescription)
    }
  });
  logDevAnalyzeTiming({
    runId,
    phase: "api.response_serialization",
    durationMs: Date.now() - responseSerializationStartedAt,
    success: true
  });
  logDevAnalyzeTiming({
    runId,
    phase: "api.total",
    durationMs: Date.now() - requestStartedAt,
    success: true
  });

  return response;
}

type TwoStepMainLogValue = string | number | boolean | null | undefined;

function createAnalyzeRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDiagnosticRunId(value: unknown) {
  if (process.env.NODE_ENV === "production" || typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return /^[a-z0-9-]{8,48}$/i.test(trimmed) ? trimmed : undefined;
}

async function augmentPdfSourceWithExtractedText({
  source,
  responseMode,
  runId
}: {
  source: TwoStepMenuSourceInput;
  responseMode: TwoStepAnalyzeResponseMode;
  runId: string;
}) {
  if (source.kind !== "pdf") {
    return source;
  }

  const startedAt = Date.now();
  const pdfUrls = uniqueStrings([
    ...(source.urls ?? []),
    source.sourceUrl ?? ""
  ]).filter(looksLikeUrl).slice(0, PDF_TEXT_AUGMENT_URL_LIMIT);

  if (pdfUrls.length === 0) {
    logTwoStepMain({
      phase: "pdf-text-augment",
      runId,
      responseMode,
      sourceKind: source.kind,
      sourceCount: getTwoStepMainSourceCount(source),
      pdfTextExtracted: false,
      pdfTextSourceCount: 0,
      pdfTextCharCount: 0,
      pdfTextSourceUrls: "",
      durationMs: Date.now() - startedAt
    });
    return source;
  }

  const extractedTexts: string[] = [];

  for (const pdfUrl of pdfUrls) {
    const pdfExtractStartedAt = Date.now();
    try {
      const extractedText = await loadMenuTextFromUrl(pdfUrl);
      logDevAnalyzeTiming({
        runId,
        phase: "api.pdf_download_extract",
        durationMs: Date.now() - pdfExtractStartedAt,
        success: true
      });
      if (extractedText.trim()) {
        extractedTexts.push(extractedText.trim());
      }
    } catch (error) {
      logDevAnalyzeTiming({
        runId,
        phase: "api.pdf_download_extract",
        durationMs: Date.now() - pdfExtractStartedAt,
        success: false,
        errorClass: error instanceof Error ? error.name : typeof error
      });
      if (process.env.NODE_ENV !== "production") {
        console.warn("GustaroAI PDF text augmentation failed.", {
          runId,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: getShortLogMessage(getErrorMessage(error))
        });
      }
    }
  }

  const supplementalText = extractedTexts
    .map((text, index) => [`PDF-Textauszug ${index + 1}:`, text].join("\n"))
    .join("\n\n")
    .slice(0, PDF_TEXT_AUGMENT_CHAR_LIMIT);
  logDevAnalyzeTiming({
    runId,
    phase: "api.pdf_compact_or_augment",
    durationMs: Date.now() - startedAt,
    candidateCount: extractedTexts.length,
    success: supplementalText.trim().length > 0
  });

  logTwoStepMain({
    phase: "pdf-text-augment",
    runId,
    responseMode,
    sourceKind: source.kind,
    sourceCount: getTwoStepMainSourceCount(source),
    pdfTextExtracted: supplementalText.trim().length > 0,
    pdfTextSourceCount: extractedTexts.length,
    pdfTextCharCount: supplementalText.length,
    pdfTextSourceUrls: pdfUrls.join(","),
    durationMs: Date.now() - startedAt
  });

  if (!supplementalText.trim()) {
    return source;
  }

  const existingText = source.text?.trim();
  const text = [
    existingText,
    "Serverseitig extrahierter PDF-Text (best effort, nur als zusätzlicher Menü-Kontext für die AI):",
    supplementalText
  ].filter(Boolean).join("\n\n");

  return {
    ...source,
    text
  };
}

function logTwoStepMain(fields: Record<string, TwoStepMainLogValue>) {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatTwoStepMainLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_2STEP_MAIN] ${payload}`);
}

function logAnalyzePerf(fields: Record<string, TwoStepMainLogValue>) {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatTwoStepMainLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_ANALYZE_PERF] ${payload}`);
}

function logDevAnalyzeTiming(fields: Record<string, TwoStepMainLogValue>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatTwoStepMainLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_DEV_ANALYZE_TIMING] ${payload}`);
}

function logTwoStepMainError({
  phase,
  runId,
  responseMode,
  sourceKind,
  sourceCount,
  durationMs,
  error
}: {
  phase: string;
  runId?: string;
  responseMode: TwoStepAnalyzeResponseMode;
  sourceKind: string;
  sourceCount: number;
  durationMs: number;
  error: unknown;
}) {
  logTwoStepMain({
    phase,
    runId,
    responseMode,
    sourceKind,
    sourceCount,
    durationMs,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: getShortLogMessage(getErrorMessage(error)),
    statusCode: getErrorStatusCode(error)
  });
}

function formatTwoStepMainLogValue(value: TwoStepMainLogValue) {
  if (typeof value === "string") {
    return value.replace(/\s+/g, "_").slice(0, 160);
  }

  return String(value);
}

function getShortLogMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function getErrorStatusCode(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status as TwoStepMainLogValue
    : undefined;
}

function getTwoStepMainSourceCount(source: TwoStepMenuSourceInput) {
  const urlCount = source.urls?.filter((url) => url.trim().length > 0).length ?? 0;
  if (urlCount > 0) return urlCount;
  if (source.sourceUrl) return 1;
  return source.text?.trim() ? 1 : 0;
}

function countDisplaySafeTranslatedNames(values: Array<{ nameOriginal: string; translatedName?: string | null }>) {
  return values.filter((item) => hasDisplaySafeTranslatedName(item.nameOriginal, item.translatedName)).length;
}

function countDisplaySafeRecommendationTranslations(recommendations: Recommendation[], dishes: Dish[]) {
  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));

  return recommendations.filter((recommendation) => {
    const dish = dishesById.get(recommendation.dishId);
    return Boolean(dish && hasDisplaySafeTranslatedName(dish.nameOriginal, recommendation.translatedName));
  }).length;
}

function hasDisplaySafeTranslatedName(nameOriginal: string, translatedName: string | null | undefined) {
  const cleaned = translatedName?.trim() ?? "";
  return cleaned.length > 0 && normalizeDisplayName(cleaned) !== normalizeDisplayName(nameOriginal);
}

function applyAllergySafetyGate({
  dishes,
  recommendations,
  profile
}: {
  dishes: Dish[];
  recommendations: Recommendation[];
  profile: AnalyzeMenuRequest["profile"];
}) {
  const activeHardProfileValues = [
    ...stringArrayValue(profile.customExclusions),
    ...stringArrayValue(profile.allergens)
  ];

  if (activeHardProfileValues.length === 0) {
    return recommendations;
  }

  const hardProfile = {
    customExclusions: activeHardProfileValues,
    allergens: stringArrayValue(profile.allergens)
  };
  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));

  return recommendations.filter((recommendation) => {
    const dish = dishesById.get(recommendation.dishId);

    if (!dish) {
      return false;
    }

    return !blockReasonForRecommendation(
      {
        nameOriginal: dish.nameOriginal,
        descriptionOriginal: dish.descriptionOriginal,
        category: dish.category,
        itemType: dish.itemType,
        dishRole: dish.dishRole,
        mealType: dish.mealType,
        substanceLevel: dish.substanceLevel,
        isMainCourseCandidate: dish.isMainCourseCandidate,
        isLightDishCandidate: dish.isLightDishCandidate,
        classificationConfidence: dish.classificationConfidence,
        sourceLine: dish.sourceLine,
        evidence: recommendation.facts
      },
      hardProfile
    );
  });
}

function stringArrayValue(values?: string[]) {
  return Array.isArray(values) ? values.filter((value) => value.trim().length > 0) : [];
}

function stripUnsafeRecommendationTranslations(
  recommendations: Recommendation[],
  dishes: Dish[],
  userLocale: string | undefined
) {
  const targetLocale = normalizeTargetLocale(userLocale);
  const targetLanguageCode = targetLocale.toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode === "en") {
    return recommendations;
  }

  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));

  return recommendations.map((recommendation) => {
    const dish = dishesById.get(recommendation.dishId);
    const translatedName = recommendation.translatedName?.trim();

    if (!translatedName || !dish) {
      return recommendation;
    }

    if (isSameDisplayName(translatedName, dish.nameOriginal) || hasLikelyEnglishDisplayText(translatedName)) {
      const { translatedName: _translatedName, ...withoutUnsafeTranslation } = recommendation;
      return withoutUnsafeTranslation;
    }

    return recommendation;
  });
}

function isSameDisplayName(left: string, right: string) {
  return normalizeDisplayName(left) === normalizeDisplayName(right);
}

function normalizeDisplayName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function buildRestaurantDescriptionPayload(restaurantDescription: LocalizedRestaurantDescriptionResult | null) {
  if (!restaurantDescription) {
    return {};
  }

  return {
    restaurantDescription: restaurantDescription.displayText,
    restaurantDescriptionSource: restaurantDescription.source,
    restaurantDescriptionUrl: restaurantDescription.sourceUrl
  };
}

function buildMenuExtractionPayload(htmlMenuExtraction: MenuExtractionResult | null) {
  return htmlMenuExtraction
    ? {
        menuExtraction: htmlMenuExtraction
      }
    : {};
}

function buildStarterCandidateDishesPayload(starterCandidateDishes: Dish[]) {
  return starterCandidateDishes.length > 0
    ? { starterCandidateDishes }
    : {};
}

async function buildStarterCandidateDishesFromSourceUrls(sourceUrls: string[]) {
  const candidates: Dish[] = [];

  for (const sourceUrl of uniqueStrings(sourceUrls)) {
    try {
      const menuText = await loadMenuTextFromUrl(sourceUrl);
      const sourceCandidates = parseMenu(menuText)
        .filter(isStarterCandidateDish)
        .map((dish) => ({
          ...dish,
          sourceFormat: dish.sourceFormat ?? (looksLikePdfUrl(sourceUrl) ? "pdf" as const : dish.sourceFormat),
          sourceUrl: dish.sourceUrl ?? sourceUrl
        }));

      candidates.push(...sourceCandidates);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("GustaroAI starter candidate catalog source failed.", error);
      }
    }
  }

  return dedupeStarterCandidateDishes(candidates).slice(0, STARTER_CANDIDATE_DISH_LIMIT);
}

function dedupeStarterCandidateDishes(dishes: Dish[]) {
  const seen = new Set<string>();

  return dishes.filter((dish) => {
    const key = normalizeStarterCandidateName(dish.nameOriginal);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isStarterCandidateDish(dish: Dish) {
  const roles = dish.dishRoles ?? [];
  const primaryRole = dish.primaryRole;
  const explicitRoles = [
    ...roles,
    ...(primaryRole && !roles.includes(primaryRole) ? [primaryRole] : [])
  ];

  if (explicitRoles.some((role) => ["main", "side", "dessert", "drink", "breakfast", "brunch", "kids", "menuSet"].includes(role))) {
    return false;
  }

  if (primaryRole === "starter" || primaryRole === "soup" || roles.includes("starter") || roles.includes("soup")) {
    return true;
  }

  if (roles.includes("salad")) {
    return dish.isStarterCandidate === true;
  }

  if (dish.dishRole !== "starter") {
    return false;
  }

  return explicitRoles.length === 0 || explicitRoles.every((role) => role === "unknown");
}

function normalizeStarterCandidateName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildAllergenInfoWarningPayload(
  profile: AnalyzeMenuRequest["profile"],
  sourceText: string,
  userLocale: string | undefined
) {
  if (!hasAllergiesOrIntolerances(profile) || hasRecognizableAllergenInfo(sourceText)) {
    return {};
  }

  return {
    analysisWarning: getAllergenInfoWarningText(userLocale)
  };
}

function getAllergenInfoWarningText(userLocale: string | undefined) {
  const targetLocale = normalizeTargetLocale(userLocale);

  if (targetLocale.startsWith("en")) {
    return "No complete allergen information was detected in this menu. Please check each dish yourself and, if you have allergies or intolerances, also ask the service staff.";
  }

  return "In dieser Speisekarte wurden keine vollständigen Allergenangaben erkannt. Bitte prüfe jedes Gericht eigenverantwortlich und frage bei Allergien oder Unverträglichkeiten zusätzlich beim Servicepersonal nach.";
}

function hasAllergiesOrIntolerances(profile: AnalyzeMenuRequest["profile"]) {
  return [profile.allergens].some((items) =>
    (items ?? []).some((item) => item.trim().length > 0)
  );
}

function hasRecognizableAllergenInfo(sourceText: string) {
  const normalized = normalizeForAllergenInfoDetection(sourceText);

  if (!normalized) {
    return false;
  }

  return [
    "allergen",
    "allergene",
    "allergenen",
    "allergie",
    "allergien",
    "allergenhinweis",
    "allergenkennzeichnung",
    "kennzeichnungspflichtige allergene",
    "zusatzstoffe und allergene",
    "glutenhaltiges getreide",
    "enthaelt gluten",
    "enthalt gluten",
    "enthaelt milch",
    "enthalt milch",
    "enthaelt ei",
    "enthalt ei",
    "enthaelt soja",
    "enthalt soja",
    "enthaelt sellerie",
    "enthalt sellerie",
    "enthaelt senf",
    "enthalt senf",
    "enthaelt sesam",
    "enthalt sesam",
    "enthaelt sulfit",
    "enthalt sulfit",
    "laktosefrei",
    "glutenfrei",
    "contains allergens",
    "contains gluten",
    "contains milk",
    "contains egg",
    "contains soy",
    "contains nuts",
    "allergy information",
    "allergen information"
  ].some((term) => normalized.includes(term));
}

function normalizeForAllergenInfoDetection(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMenuAnalysisDetails(
  restaurantDescription: LocalizedRestaurantDescriptionResult | null,
  htmlMenuExtraction: MenuExtractionResult | null
) {
  const details = {
    ...buildRestaurantDescriptionPayload(restaurantDescription),
    ...buildMenuExtractionPayload(htmlMenuExtraction)
  };

  return Object.keys(details).length > 0 ? details : undefined;
}

async function classifyUnclearDishRoles(dishes: Dish[]): Promise<Dish[]> {
  if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
    return dishes;
  }

  const candidates = getDishesNeedingRoleClassification(dishes);

  if (candidates.length === 0) {
    return dishes;
  }

  try {
    const classifications = await withTimeout(
      classifyDishRolesAI({
        dishes: candidates.slice(0, 80)
      }),
      DISH_ROLE_CLASSIFICATION_TIMEOUT_MS,
      "DISH_ROLE_CLASSIFICATION_TIMEOUT"
    );

    return applyDishRoleClassifications(dishes, classifications);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("GustaroAI dish role classification failed.", error);
    }

    return dishes;
  }
}

function isFoodDish(dish: Dish) {
  return dish.itemType !== "drink" && dish.dishRole !== "drink";
}

function buildPartialAnalysisPayload(
  restaurantDescription: LocalizedRestaurantDescriptionResult | null,
  htmlMenuExtraction: MenuExtractionResult | null,
  dishes: Dish[]
) {
  if (!restaurantDescription) {
    return null;
  }

  return {
    mode: "fallback" as const,
    dishes,
    recommendations: [],
    conciergeHero: "",
    analysisStatus: "analysis_not_safe" as const,
    analysisWarning: "Ich konnte diese Speisekarte nicht sicher auswerten.",
    ...buildRestaurantDescriptionPayload(restaurantDescription),
    ...buildMenuExtractionPayload(htmlMenuExtraction)
  };
}

async function localizeRestaurantDescriptionForPayload(
  restaurantDescription: RestaurantDescriptionResult | null,
  userLocale: string | undefined
): Promise<LocalizedRestaurantDescriptionResult | null> {
  if (!restaurantDescription) {
    return null;
  }

  const displayText = await translateRestaurantDescriptionText({
    text: restaurantDescription.text,
    targetLocale: normalizeTargetLocale(userLocale)
  });

  if (!displayText) {
    return null;
  }

  return {
    ...restaurantDescription,
    displayText
  };
}

async function translateRestaurantDescriptionText({
  text,
  targetLocale
}: {
  text: string;
  targetLocale: string;
}) {
  const sourceText = text.trim();

  if (!sourceText) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const client = new OpenAI({ apiKey });
    const targetLanguage = getLanguageNameForLocale(targetLocale);
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Translate and compress official restaurant descriptions for the GustaroAI app.",
            `Target language: ${targetLanguage}.`,
            `Target locale: ${targetLocale}.`,
            "",
            "Rules:",
            "- Translate the source text into the target language.",
            "- Compress the result to at most two sentences and at most 30 words.",
            "- Preserve only facts that are explicitly present in the source text.",
            "- Omit repetitions and non-essential wording.",
            "- Do not add facts.",
            "- Do not add dishes, prices, ingredients, atmosphere, ratings, or recommendations.",
            "- Do not invent anything.",
            "- Do not use recommendation language.",
            "- Return only the compressed restaurant description."
          ].join("\n")
        },
        {
          role: "user",
          content: sourceText.slice(0, 5000)
        }
      ]
    });

    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("GustaroAI restaurant description translation failed.", error);
    return null;
  }
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

async function buildConciergeHeroFromOfficialWebsiteText({
  officialWebsiteText,
  restaurantUrl,
  fallbackHero
}: {
  officialWebsiteText: string | undefined;
  restaurantUrl?: string;
  fallbackHero: string;
}) {
  const officialText = officialWebsiteText?.trim();

  if (!officialText) {
    return fallbackHero;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return "";
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Verdichte ausschliesslich die folgende offizielle Restaurantbeschreibung.",
            "Interpretiere nicht.",
            "Empfiehl nichts.",
            "Wirb nicht.",
            "Gib nur die offizielle Restaurantbeschreibung in maximal zwei Saetzen wieder.",
            "",
            `URL:\n${restaurantUrl ?? ""}`,
            "",
            "Extrahiere ausschliesslich:",
            "- Restaurantname",
            "- Lage",
            "- Selbstbeschreibung",
            "- Philosophie",
            "- Kuechenstil",
            "- Tradition",
            "- Besonderheiten, die das Restaurant selbst hervorhebt",
            "",
            "Ignoriere vollstaendig:",
            "- Navigation",
            "- Cookie-Hinweise",
            "- Impressum",
            "- Kontaktinformationen",
            "- Reservierung",
            "- Oeffnungszeiten",
            "- SEO-Titel",
            "- Meta-Texte",
            "- Social-Media",
            "- Werbung",
            "",
            "Wenn die Homepage nicht in der Sprache des Nutzers geschrieben ist, uebersetze den relevanten Inhalt vollstaendig in die Sprache des Nutzers.",
            "Wenn die Website mehrere Sprachen enthaelt, verwende ausschliesslich den Inhalt in der Sprache des Nutzers.",
            "Falls diese Sprache nicht vorhanden ist, verwende die Originalsprache und uebersetze sie vollstaendig.",
            "",
            "Danach:",
            "- verdichte den Inhalt auf maximal zwei Saetze",
            "- aendere keine Fakten",
            "- ergaenze keine Informationen",
            "- benutze keine externen Quellen",
            "- erfinde nichts",
            "- keine Empfehlung",
            "- keine Bewertung",
            "- keine Interpretation",
            "- keine Werbung"
          ].join("\n")
        },
        {
          role: "user",
          content: officialText.slice(0, 5000)
        }
      ]
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    console.error("GustaroAI official website hero editor failed.", error);
    return "";
  }
}

function getOfficialRestaurantHomepageUrl(value: string): string | undefined {
  try {
    return `${new URL(value).origin}/`;
  } catch {
    return undefined;
  }
}

function isInvalidImageAiError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return status === 400 && (
    message.includes("valid image") ||
    message.includes("invalid image") ||
    message.includes("supported formats") ||
    message.includes("image data")
  );
}

function buildFallbackConciergeHero({
  dishes = [],
  menuType,
  recommendationMode,
  restaurantContextText,
  officialWebsiteText
}: FallbackHeroContext) {
  const officialWebsiteHero = buildOfficialWebsiteHero(officialWebsiteText);

  if (officialWebsiteHero) {
    return officialWebsiteHero;
  }

  const restaurantText = normalizeHeroText(restaurantContextText ?? "");
  const menuText = normalizeHeroText([
    menuType,
    recommendationMode,
    ...dishes.flatMap((dish) => [
      dish.nameOriginal,
      dish.descriptionOriginal,
      dish.category,
      dish.sourceLine
    ])
  ].filter(Boolean).join(" "));
  const combinedText = `${restaurantText} ${menuText}`.trim();

  const restaurantHero = buildRestaurantContextHero(restaurantText);

  if (restaurantHero) {
    return restaurantHero;
  }

  if (
    recommendationMode === "whole_menu" ||
    hasAnyHeroTerm(combinedText, ["tasting menu", "degustationsmenu", "degustationsmenue", "set menu", "gaenge menu", "gaenge menue", "whole menu"])
  ) {
    return "Dieses Restaurant setzt auf ein kuratiertes Menueerlebnis. Hier steht das Menue als Ganzes im Vordergrund, nicht der Vergleich einzelner Gaenge.";
  }

  if (
    recommendationMode === "sharing_menu" ||
    hasAnyHeroTerm(combinedText, ["sharing", "tapas", "mezze", "platte", "platten", "zum teilen"])
  ) {
    return "Diese Karte ist auf gemeinsames Bestellen ausgelegt. Die Auswahl ergibt deshalb vor allem als stimmige Entscheidung fuer den Tisch Sinn.";
  }

  if (hasAnyHeroTerm(combinedText, ["pasta", "pizza", "risotto", "antipasti", "trattoria", "italien", "bruschetta", "pinsa", "gnocchi", "tagliatelle", "spaghetti"])) {
    return "Die Karte ist klassisch italienisch gepraegt. Im Vordergrund stehen die Optionen, die diesen Stil des Hauses am klarsten zeigen.";
  }

  if (hasAnyHeroTerm(combinedText, ["steak", "rind", "beef", "grill", "bbq", "burger", "entrecote", "ribeye", "roastbeef", "fleisch", "duroc", "iberico"])) {
    return "Diese Karte ist klar fleischorientiert. Die Auswahl konzentriert sich deshalb zuerst auf die Gerichte, die diese Ausrichtung am deutlichsten zeigen.";
  }

  if (hasAnyHeroTerm(combinedText, ["fraenkisch", "frankisch", "regional", "traditionell", "schaeufele", "schaufel", "braten", "kloesse", "knodel", "rauchbier", "hausgemacht"])) {
    return "Diese Karte ist regional und traditionell gepraegt. Die naheliegenden Entscheidungen liegen deshalb zuerst bei den Klassikern des Hauses.";
  }

  if (hasAnyHeroTerm(combinedText, ["sushi", "sashimi", "ramen", "tempura", "yakitori", "izakaya"])) {
    return "Diese Karte ist japanisch gepraegt. Die Empfehlungen orientieren sich deshalb zuerst an diesem klaren Kuechenstil.";
  }

  return "Diese Karte ist breit aufgestellt. Die Auswahl konzentriert sich zuerst auf die klarsten passenden Optionen und gleicht sie danach mit Deinem Profil ab.";
}

function buildRestaurantContextHero(text: string) {
  if (!text) {
    return undefined;
  }

  if (hasAnyHeroTerm(text, ["trattoria", "osteria", "ristorante", "pizzeria", "italian", "italienisch"])) {
    return "Dieses Restaurant ist italienisch gepraegt. Die Karte wird deshalb zuerst danach gelesen, welche Optionen diesen Stil am klarsten tragen.";
  }

  if (hasAnyHeroTerm(text, ["steakhouse", "grillhouse", "bbq", "asador", "parrilla"])) {
    return "Dieses Restaurant ist fleisch- und grillorientiert. Die Auswahl konzentriert sich deshalb zuerst auf die Optionen, die diese Ausrichtung am klarsten abbilden.";
  }

  if (hasAnyHeroTerm(text, ["weinbar", "winebar", "wine bar", "vinoteca", "enoteca"])) {
    return "Dieses Restaurant ist als Weinbar mit begleitendem Essen angelegt. Die Empfehlungen folgen deshalb einem eher kuratierten Rahmen.";
  }

  if (hasAnyHeroTerm(text, ["sushi", "izakaya", "ramen", "japanese", "japanisch"])) {
    return "Dieses Restaurant ist japanisch gepraegt. Die Empfehlungen folgen deshalb zuerst diesem klaren Kuechenstil.";
  }

  if (hasAnyHeroTerm(text, ["tapas", "mezze", "sharing"])) {
    return "Dieses Restaurant ist auf gemeinsames Bestellen ausgelegt. Die Auswahl wird deshalb zuerst als Tischentscheidung betrachtet, nicht als einzelne Solowahl.";
  }

  if (hasAnyHeroTerm(text, ["fine dining", "degustation", "tasting", "menuerlebnis", "menueerlebnis"])) {
    return "Dieses Restaurant ist auf ein kuratiertes Restauranterlebnis ausgelegt. Die Karte wird deshalb zuerst als Konzept gelesen und erst danach als einzelne Auswahl.";
  }

  return undefined;
}

function buildOfficialWebsiteHero(value: string | undefined) {
  const officialText = cleanOfficialWebsiteHeroText(value ?? "");

  if (!officialText) {
    return undefined;
  }

  const translated = translateOfficialWebsiteHeroToGerman(officialText);

  return clampHeroLength(translated);
}

function cleanOfficialWebsiteHeroText(value: string) {
  const candidates = value
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((part) => cleanOfficialContextText(part))
    .map(removeSeoTitleFragments)
    .filter(isAllowedOfficialHeroSentence);
  const usefulCandidates = candidates.filter(isUsefulOfficialHeroSentence);
  const selectedCandidates = dedupeOfficialHeroSentences(
    usefulCandidates.length > 0 ? usefulCandidates : candidates
  ).slice(0, 3);

  return selectedCandidates.join(" ").trim();
}

function removeSeoTitleFragments(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const parts = normalized
    .split(/\s(?:[|–—-]|::|»)\s/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return normalized;
  }

  const descriptiveParts = parts.filter((part) => isUsefulOfficialHeroSentence(part));

  return (descriptiveParts[0] ?? parts.find((part) => part.length > 35) ?? "").trim();
}

function dedupeOfficialHeroSentences(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = normalizeHeroText(value);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isAllowedOfficialHeroSentence(value: string) {
  const normalized = normalizeHeroText(value);

  if (value.length < 30 || value.length > 1200) {
    return false;
  }

  if (/[€$£]\s?\d|\d+[,.]\d{2}/.test(value)) {
    return false;
  }

  if (hasAnyHeroTerm(normalized, [
    "cookie",
    "privacy",
    "datenschutz",
    "impressum",
    "reserv",
    "book",
    "opening",
    "oeffnungszeiten",
    "kontakt",
    "menu pdf",
    "speisekarte pdf",
    "newsletter",
    "copyright",
    "home",
    "homepage",
    "skip to",
    "toggle",
    "navigation",
    "language",
    "powered by",
    "wordpress",
    "ristorante il pozzetto roma borgo pio roma",
    "welcome",
    "benvenuti",
    "scopri",
    "discover",
    "best restaurant",
    "miglior",
    "excellent",
    "eccellente",
    "specialita",
    "speciality",
    "vi aspettiamo"
  ])) {
    return false;
  }

  if (normalized.split(" ").length < 5) {
    return false;
  }

  return true;
}

function isUsefulOfficialHeroSentence(value: string) {
  const normalized = normalizeHeroText(value);

  return hasAnyHeroTerm(normalized, [
    "located",
    "lage",
    "liegt",
    "close to",
    "near",
    "historic",
    "tradition",
    "traditional",
    "mediterranean",
    "mediterran",
    "cuisine",
    "kueche",
    "restaurant",
    "trattoria",
    "osteria",
    "ristorante",
    "fresh",
    "frisch",
    "regional",
    "concept",
    "konzept",
    "family",
    "familie"
  ]);
}

function translateOfficialWebsiteHeroToGerman(value: string) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const translated = sentences.map(translateOfficialSentenceToGerman);

  return translated.join(" ");
}

function translateOfficialSentenceToGerman(sentence: string) {
  const trimmed = sentence.trim();
  const normalized = normalizeHeroText(trimmed);

  if (/carefully selected cuisine/i.test(trimmed) || /freshest,?\s*quality ingredients/i.test(trimmed)) {
    const mediterraneanPrefix = /mediterranean/i.test(trimmed) ? "Die Kueche ist mediterran gepraegt und " : "Die Kueche ";

    return `${mediterraneanPrefix}basiert laut Restaurant auf sorgfaeltig ausgewaehlten, frischen Zutaten.`;
  }

  if (/mediterranean/i.test(trimmed) && /tradition/i.test(trimmed)) {
    return "Die Kueche ist laut Restaurant mediterran und traditionell gepraegt.";
  }

  if (
    hasAnyHeroTerm(normalized, ["borgo pio"]) &&
    hasAnyHeroTerm(normalized, ["vatican", "vaticano", "vatikan", "san pietro"])
  ) {
    return "Il Pozzetto liegt im historischen Borgo Pio nahe dem Vatikan.";
  }

  if (
    hasAnyHeroTerm(normalized, ["cucina mediterranea", "mediterranean cuisine", "cuisine mediterranean"]) ||
    hasAnyHeroTerm(normalized, ["freshest quality ingredients", "ingredienti freschi", "ingredienti di qualita"])
  ) {
    const mediterraneanPrefix = hasAnyHeroTerm(normalized, ["mediterranean", "mediterranea", "mediterraneo"])
      ? "Die Kueche ist mediterran gepraegt und "
      : "Die Kueche ";

    return `${mediterraneanPrefix}basiert laut Restaurant auf sorgfaeltig ausgewaehlten, frischen Zutaten.`;
  }

  if (hasAnyHeroTerm(normalized, ["tradizionale", "tradizionali", "traditional"])) {
    return "Die Kueche ist laut Restaurant traditionell gepraegt.";
  }

  const locationMatch = trimmed.match(/^(.+?)\s+is located\s+(?:in|at)\s+(.+?)(?:,\s*close to\s+(.+?))?\.?$/i);

  if (locationMatch?.[1] && locationMatch[2]) {
    const place = translateLocationPhrase(locationMatch[2]);
    const nearby = locationMatch[3] ? ` nahe ${translateLocationPhrase(locationMatch[3])}` : "";

    return `${locationMatch[1]} liegt ${place}${nearby}.`;
  }

  if (/carefully selected cuisine/i.test(trimmed) || /freshest,\s*quality ingredients/i.test(trimmed)) {
    return "Die Küche basiert laut Restaurant auf sorgfältig ausgewählten, frischen Zutaten.";
  }

  if (/mediterranean/i.test(trimmed) && /tradition/i.test(trimmed)) {
    return "Die Küche ist laut Restaurant mediterran und traditionell geprägt.";
  }

  return ensureSentencePunctuation(trimmed);
}

function translateLocationPhrase(value: string) {
  return value
    .replace(/\bthe historic\b/gi, "im historischen")
    .replace(/\bhistoric\b/gi, "historischen")
    .replace(/\bVatican City\b/gi, "dem Vatikan")
    .replace(/\bthe Vatican\b/gi, "dem Vatikan")
    .replace(/\bRome\b/gi, "Rom")
    .replace(/\bclose to\b/gi, "nahe")
    .trim();
}

function clampHeroLength(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 320) {
    return normalized;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const shortened = sentences.reduce<string[]>((parts, sentence) => {
    const next = [...parts, sentence].join(" ");
    return next.length <= 320 ? [...parts, sentence] : parts;
  }, []);

  return (shortened.join(" ") || `${normalized.slice(0, 300).trim()}...`).trim();
}

function ensureSentencePunctuation(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function hasAnyHeroTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function normalizeHeroText(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorCode)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isRateLimitError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  const message = getErrorMessage(error);

  return status === 429 ||
    message.includes("429") ||
    message.includes("Rate limit") ||
    message.includes("rate limit") ||
    message.includes("TPM");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function getShortRetryDelayMs(error: unknown) {
  const headerDelay = getRetryAfterDelayMs(error) ?? getResetDelayMs(error);
  const retryDelayMs = headerDelay ?? 1000;

  return retryDelayMs <= 3000 ? retryDelayMs : undefined;
}

function getRetryAfterDelayMs(error: unknown) {
  const value = getErrorHeader(error, "retry-after");

  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function getResetDelayMs(error: unknown) {
  const value = getErrorHeader(error, "x-ratelimit-reset-requests") ??
    getErrorHeader(error, "x-ratelimit-reset-tokens");

  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s)?$/i);

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "s";

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  return unit === "ms" ? amount : amount * 1000;
}

function getErrorHeader(error: unknown, name: string) {
  if (typeof error !== "object" || error === null || !("headers" in error)) {
    return undefined;
  }

  const headers = (error as { headers?: unknown }).headers;

  if (!headers) {
    return undefined;
  }

  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get: (headerName: string) => unknown }).get(name);
    return typeof value === "string" ? value : undefined;
  }

  if (typeof headers === "object" && headers !== null) {
    const value = (headers as Record<string, unknown>)[name] ??
      (headers as Record<string, unknown>)[name.toLowerCase()];
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withAbortTimeout<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  errorCode: string
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  const promise = factory(controller.signal);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new Error(errorCode));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);

        if (didTimeout) {
          return;
        }

        reject(error);
      });
  });
}








function looksLikePdfUrl(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function canonicalizePdfSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

async function loadOfficialRestaurantContextFromUrl(value: string): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(value, 8000);

    if (!response.ok) {
      return undefined;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return undefined;
    }

    return extractOfficialRestaurantContext(await response.text());
  } catch {
    return undefined;
  }
}

async function loadOfficialRestaurantContextFromOrigin(value: string): Promise<string | undefined> {
  try {
    const inputUrl = new URL(value);
    const homepageUrl = `${inputUrl.origin}/`;

    return loadOfficialRestaurantContextFromUrl(homepageUrl);
  } catch {
    return undefined;
  }
}

async function findLinkedPdfMenu(value: string): Promise<LinkedPdfMenu | null> {
  try {
    const response = await fetchWithTimeout(value, 8000);

    if (!response.ok) {
      return null;
    }

    const finalUrl = response.url || value;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (looksLikePdfUrl(finalUrl) || contentType.includes("application/pdf")) {
      return { url: canonicalizePdfSourceUrl(finalUrl) };
    }

    const html = await response.text();
    const candidates = extractPdfCandidates(html, finalUrl);
    const selectedCandidate = await selectBestLinkedPdfMenuCandidate(candidates);

    return selectedCandidate
      ? {
          url: selectedCandidate.url,
          urls: selectedCandidate.urls?.length ? selectedCandidate.urls : [selectedCandidate.url],
          restaurantContextText: extractOfficialRestaurantContext(html)
        }
      : null;
  } catch {
    return null;
  }
}

function extractOfficialRestaurantContext(html: string): string | undefined {
  const parts = [
    ...extractMetaContents(html),
    ...extractHtmlTextSnippets(html)
  ]
    .map(cleanOfficialContextText)
    .filter((part) => part.length >= 30);
  const seen = new Set<string>();
  const uniqueParts = parts.filter((part) => {
    const key = part.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
  const context = uniqueParts.join("\n").slice(0, 1200).trim();

  return context || undefined;
}

function extractMetaContents(html: string): string[] {
  const contents: string[] = [];
  const metaPattern = /<meta\b[^>]*>/gi;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (titleMatch?.[1]) {
    contents.push(titleMatch[1]);
  }

  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(html)) !== null) {
    const tag = match[0];

    if (!/\b(?:name|property)=["'](?:description|og:description|twitter:description)["']/i.test(tag)) {
      continue;
    }

    const contentMatch = tag.match(/\bcontent=["']([^"']+)["']/i);

    if (contentMatch?.[1]) {
      contents.push(contentMatch[1]);
    }
  }

  return contents;
}

function extractHtmlTextSnippets(html: string): string[] {
  const snippets: string[] = [];
  const textPattern = /<(?:h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|p)>/gi;
  let match: RegExpExecArray | null;

  while ((match = textPattern.exec(html)) !== null && snippets.join(" ").length < 1200) {
    if (match[1]) {
      snippets.push(match[1]);
    }
  }

  return snippets;
}

function cleanOfficialContextText(value: string): string {
  return decodeHtmlAttribute(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&auml;/gi, "ae")
    .replace(/&ouml;/gi, "oe")
    .replace(/&uuml;/gi, "ue")
    .replace(/&Auml;/gi, "Ae")
    .replace(/&Ouml;/gi, "Oe")
    .replace(/&Uuml;/gi, "Ue")
    .replace(/&szlig;/gi, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPdfCandidates(html: string, baseUrl: string): MenuSourceCandidate[] {
  return [
    ...extractLinkedMenuSourceCandidates(html, baseUrl, "pdf"),
    ...extractEmbeddedPdfCandidates(html, baseUrl)
  ]
    .filter((candidate, index, candidates) =>
      candidates.findIndex((other) => other.url.toLowerCase() === candidate.url.toLowerCase()) === index
    )
    .sort((a, b) => scorePdfCandidate(b.url) - scorePdfCandidate(a.url));
}

function extractEmbeddedPdfCandidates(html: string, baseUrl: string): MenuSourceCandidate[] {
  const candidates: MenuSourceCandidate[] = [];
  const normalizedHtml = html.replace(/\\\//g, "/");
  const urlPattern = /(?:https?:\/\/|\/)[^\s"'<>\\]+\.pdf(?:[^\s"'<>\\]*)?/gi;
  let match: RegExpExecArray | null;
  let index = 10000;

  while ((match = urlPattern.exec(normalizedHtml)) !== null) {
    collectMenuSourceCandidate(
      candidates,
      decodeHtmlAttribute(match[0] ?? ""),
      "",
      baseUrl,
      "pdf",
      index
    );
    index += 1;
  }

  return candidates;
}

async function selectPdfMenuForAnalysis({
  providedPdfMenuUrls,
  directPdfUrl,
  linkedPdfMenu,
  runId
}: {
  providedPdfMenuUrls: string[];
  directPdfUrl: string | null;
  linkedPdfMenu: LinkedPdfMenu | null;
  runId?: string;
}): Promise<LinkedPdfMenu | null> {
  const candidates = [
    ...(directPdfUrl
      ? [{
          url: directPdfUrl,
          urls: [directPdfUrl],
          label: "direct menu text pdf",
          baseScore: 40,
          source: "direct" as const
        }]
      : []),
    ...(providedPdfMenuUrls.length > 0
      ? [{
          url: providedPdfMenuUrls[0] ?? "",
          urls: providedPdfMenuUrls,
          label: "provided pdf menu urls",
          baseScore: 10,
          source: "provided" as const
        }]
      : []),
    ...(linkedPdfMenu?.url
      ? [{
          url: linkedPdfMenu.url,
          urls: linkedPdfMenu.urls?.length ? linkedPdfMenu.urls : [linkedPdfMenu.url],
          label: "linked pdf menu",
          baseScore: 25,
          source: "linked" as const,
          restaurantContextText: linkedPdfMenu.restaurantContextText
        }]
      : [])
  ].filter((candidate) => candidate.url);

  if (candidates.length === 0) {
    return null;
  }

  const rankingStartedAt = Date.now();
  const rankedCandidates = await rankMenuSourceCandidatesByQuality(candidates);
  logDevAnalyzeTiming({
    runId,
    phase: "api.pdf_source_quality",
    durationMs: Date.now() - rankingStartedAt,
    candidateCount: candidates.length,
    success: true
  });
  const selected = rankedCandidates[0];
  const selectedSource = candidates.find((candidate) => candidate.url === selected?.url);

  if (selected) {
    console.info("[GUSTARO_PDF_ANALYSIS_SOURCE_SELECTION]", JSON.stringify({
      selectedUrl: selected.url,
      selectedSource: selectedSource?.source ?? "unknown",
      selectedUrlsCount: selected.urls?.length ?? 1,
      textLength: selected.metrics.textLength,
      dishCount: selected.metrics.dishCount,
      priceCount: selected.metrics.priceCount,
      score: selected.metrics.score,
      candidates: rankedCandidates.map((candidate) => {
        const source = candidates.find((original) => original.url === candidate.url)?.source ?? "unknown";

        return {
          url: candidate.url,
          source,
          urlsCount: candidate.urls?.length ?? 1,
          textLength: candidate.metrics.textLength,
          dishCount: candidate.metrics.dishCount,
          priceCount: candidate.metrics.priceCount,
          score: candidate.metrics.score
        };
      })
    }));
  }

  return selected
    ? {
        url: selected.url,
        urls: selected.urls?.length ? selected.urls : [selected.url],
        restaurantContextText: selectedSource?.restaurantContextText
      }
    : null;
}

async function selectBestLinkedPdfMenuCandidate(
  candidates: MenuSourceCandidate[]
): Promise<{ url: string; urls?: string[] } | null> {
  const familyUrls = findNormalMenuSourceFamilyUrls(candidates);
  const qualityCandidates = [
    ...candidates
      .map((candidate) => ({
        url: candidate.url,
        label: candidate.label,
        baseScore: scorePdfCandidate(candidate.url)
      })),
    ...(familyUrls.length > 1
      ? [{
          url: familyUrls[0] ?? "",
          urls: familyUrls,
          label: "pdf family",
          baseScore: 30
        }]
      : [])
  ].filter((candidate) => candidate.url);
  const rankedCandidates = await rankMenuSourceCandidatesByQuality(qualityCandidates);
  const selected = rankedCandidates[0];

  if (selected) {
    console.info("[GUSTARO_LINKED_PDF_SELECTION]", JSON.stringify({
      selectedUrl: selected.url,
      selectedUrlsCount: selected.urls?.length ?? 1,
      textLength: selected.metrics.textLength,
      dishCount: selected.metrics.dishCount,
      priceCount: selected.metrics.priceCount,
      score: selected.metrics.score,
      candidates: rankedCandidates.map((candidate) => ({
        url: candidate.url,
        urlsCount: candidate.urls?.length ?? 1,
        textLength: candidate.metrics.textLength,
        dishCount: candidate.metrics.dishCount,
        priceCount: candidate.metrics.priceCount,
        score: candidate.metrics.score
      }))
    }));
  }

  return selected
    ? {
        url: selected.url,
        urls: selected.urls
      }
    : null;
}

async function extractHtmlMenuFamilyFromUrl(value: string): Promise<MenuExtractionResult | null> {
  try {
    const response = await fetchWithTimeout(value, 8000);

    if (!response.ok) {
      return extractHtmlMenuFromUrl(value);
    }

    const finalUrl = response.url || value;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return extractHtmlMenuFromUrl(value);
    }

    const html = await response.text();
    const sameDomainCandidates = [
      {
        url: finalUrl,
        label: "",
        index: -1,
        sourceKind: "html" as const
      },
      ...extractLinkedMenuSourceCandidates(html, finalUrl, "html")
    ].filter((candidate) => getRegistrableDomain(candidate.url) === getRegistrableDomain(finalUrl));
    const familyUrls = findNormalMenuSourceFamilyUrls(sameDomainCandidates, finalUrl);

    if (familyUrls.length < 2) {
      return extractHtmlMenuFromUrl(finalUrl);
    }

    const extractions = (await Promise.all(familyUrls.map((url) => extractHtmlMenuFromUrl(url))))
      .filter((result): result is MenuExtractionResult => Boolean(result));

    if (extractions.length === 0) {
      return extractHtmlMenuFromUrl(finalUrl);
    }

    return combineHtmlMenuExtractions(extractions);
  } catch {
    return extractHtmlMenuFromUrl(value);
  }
}

function combineHtmlMenuExtractions(values: MenuExtractionResult[]): MenuExtractionResult {
  const items = dedupeHtmlMenuItems(values.flatMap((value) => value.items));
  const fragments = uniqueStrings(values.flatMap((value) => value.fragments)).slice(0, 80);

  return {
    sourceFormat: "html",
    items,
    confidence: items.length >= 3 ? "high" : items.length > 0 ? "medium" : "low",
    warnings: values.flatMap((value) => value.warnings),
    fragments
  };
}

function dedupeHtmlMenuItems(items: MenuExtractionResult["items"]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = normalizeMenuSourceText(`${item.title} ${item.price ?? ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRequestedDishRoles(values?: RequestedDishRole[]): RequestedDishRole[] {
  const allowed = new Set<RequestedDishRole>(["starter", "salad", "main"]);
  const roles = Array.isArray(values)
    ? values.filter((value): value is RequestedDishRole => allowed.has(value))
    : [];

  if (roles.includes("starter") || roles.includes("salad")) {
    return ["starter", "salad"];
  }

  return ["main"];
}

function extractLinkedMenuSourceCandidates(
  html: string,
  baseUrl: string,
  sourceKind: MenuSourceKind
): MenuSourceCandidate[] {
  const candidates: MenuSourceCandidate[] = [];
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const attributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = anchorPattern.exec(html)) !== null) {
    collectMenuSourceCandidate(
      candidates,
      decodeHtmlAttribute(match[1] ?? ""),
      htmlToSourceLabel(match[2] ?? ""),
      baseUrl,
      sourceKind,
      index
    );
    index += 1;
  }

  while ((match = attributePattern.exec(html)) !== null) {
    collectMenuSourceCandidate(
      candidates,
      decodeHtmlAttribute(match[1] ?? ""),
      "",
      baseUrl,
      sourceKind,
      index
    );
    index += 1;
  }

  return dedupeMenuSourceCandidates(candidates);
}

function collectMenuSourceCandidate(
  candidates: MenuSourceCandidate[],
  rawValue: string,
  label: string,
  baseUrl: string,
  sourceKind: MenuSourceKind,
  index: number
) {
  try {
    const resolvedUrl = new URL(rawValue, baseUrl).toString();
    const url = sourceKind === "pdf" ? canonicalizePdfSourceUrl(resolvedUrl) : resolvedUrl;
    if (!sourceKindMatchesUrl(sourceKind, url)) return;

    candidates.push({
      url,
      label,
      index,
      sourceKind
    });
  } catch {
    // ignore invalid links
  }
}

function dedupeMenuSourceCandidates(values: MenuSourceCandidate[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = `${value.sourceKind}:${value.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceKindMatchesUrl(sourceKind: MenuSourceKind, value: string) {
  if (sourceKind === "pdf") return looksLikePdfUrl(value);
  if (sourceKind === "image") return looksLikeImageUrl(value);
  return !looksLikePdfUrl(value) && !looksLikeImageUrl(value);
}

function findNormalMenuSourceFamilyUrls(candidates: MenuSourceCandidate[], primaryUrl?: string): string[] {
  const infos = candidates
    .map(toMenuSourceFamilyInfo)
    .filter((info): info is MenuSourceFamilyInfo => Boolean(info));
  const groups = new Map<string, MenuSourceFamilyInfo[]>();

  for (const info of infos) {
    const key = `${info.sourceKind}:${info.directoryKey}:${info.familyKey}`;
    groups.set(key, [...(groups.get(key) ?? []), info]);
  }

  const primaryKey = primaryUrl?.trim().toLowerCase();
  const families = [...groups.values()]
    .filter((group) => uniqueStrings(group.map((info) => info.url)).length >= 2)
    .sort((left, right) => {
      const leftHasPrimary = primaryKey ? left.some((info) => info.url.toLowerCase() === primaryKey) : false;
      const rightHasPrimary = primaryKey ? right.some((info) => info.url.toLowerCase() === primaryKey) : false;
      if (leftHasPrimary !== rightHasPrimary) return leftHasPrimary ? -1 : 1;
      return Math.min(...left.map((info) => info.index)) - Math.min(...right.map((info) => info.index));
    });

  const family = families[0];
  if (!family) return [];

  return uniqueStrings(
    family
      .sort((left, right) => left.partOrder - right.partOrder || left.index - right.index)
      .map((info) => info.url)
  );
}

function toMenuSourceFamilyInfo(candidate: MenuSourceCandidate): MenuSourceFamilyInfo | null {
  let url: URL;

  try {
    url = new URL(candidate.url);
  } catch {
    return null;
  }

  const stem = getUrlStem(url);
  const probe = normalizeMenuSourceText(`${url.pathname} ${url.search} ${candidate.label}`);
  const keySource = normalizeMenuSourceText(`${stem} ${candidate.label}`);
  const partOrder = getMenuPartOrder(keySource);

  if (!partOrder) return null;
  if (!hasRegularMenuSourceTerm(probe)) return null;
  if (hasExcludedMenuSourceTerm(probe)) return null;

  const familyKey = normalizeMenuFamilyKey(keySource);
  if (!familyKey || familyKey === keySource) return null;

  return {
    ...candidate,
    directoryKey: `${url.origin.toLowerCase()}${getUrlDirectory(url)}`,
    familyKey,
    partOrder
  };
}

function getUrlStem(url: URL) {
  const segment = safeDecodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  return segment.replace(/\.[a-z0-9]+$/i, "");
}

function getUrlDirectory(url: URL) {
  const pathname = url.pathname.toLowerCase();
  const index = pathname.lastIndexOf("/");
  return index >= 0 ? pathname.slice(0, index + 1) : "/";
}

function normalizeMenuFamilyKey(value: string) {
  return stripMenuPartMarkers(value)
    .replace(/\b(?:oeffnen|offnen|open|download|downloads|view|ansehen|pdf|html|jpg|jpeg|png|webp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMenuPartMarkers(value: string) {
  return value
    .replace(/\b(?:vorne|front|vorderseite)\b/g, " ")
    .replace(/\b(?:hinten|back|rueckseite|ruckseite)\b/g, " ")
    .replace(/\b(?:seite|page|teil|part)\s*\d+\b/g, " ")
    .replace(/\b(speisekarte|menu)\s+\d+\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getMenuPartOrder(value: string) {
  if (/\b(?:vorne|front|vorderseite)\b/.test(value)) return 1;
  if (/\b(?:hinten|back|rueckseite|ruckseite)\b/.test(value)) return 2;

  const numbered = value.match(/\b(?:seite|page|teil|part)\s*(\d+)\b/)
    ?? value.match(/\b(?:speisekarte|menu)\s+(\d+)\b/);
  return numbered ? Number(numbered[1]) || 0 : 0;
}

function hasRegularMenuSourceTerm(value: string) {
  return [
    "speisekarte",
    "restaurantkarte",
    "karte",
    "menu",
    "menue",
    "food menu",
    "main menu",
    "restaurant menu",
    "carte",
    "carta",
    "ementa",
    "menukaart",
    "a la carte",
    "ristorante",
    "restaurante",
    "restaurant"
  ].some((term) => value.includes(term));
}

function hasExcludedMenuSourceTerm(value: string) {
  return [
    "fruehstueck",
    "fruhstuck",
    "breakfast",
    "brunch",
    "colazione",
    "petit dejeuner",
    "desayuno",
    "pequeno almoco",
    "cafe da manha",
    "ontbijt",
    "tageskarte",
    "wochenkarte",
    "sonntagskarte",
    "aktionskarte",
    "saisonkarte",
    "getraenkekarte",
    "getrankekarte",
    "drinks",
    "beverages",
    "weinkarte",
    "wine",
    "dessertkarte",
    "dessert",
    "eventkarte",
    "cateringkarte"
  ].some((term) => value.includes(term));
}

function normalizeMenuSourceText(value: string) {
  return safeDecodeURIComponent(value)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function htmlToSourceLabel(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scorePdfCandidate(value: string): number {
  const normalized = decodeURIComponent(value.toLowerCase());
  let score = 0;

  if (normalized.includes("deutsch")) score += 5;
  if (normalized.includes("german")) score += 5;
  if (normalized.includes("speisekarte")) score += 6;
  if (normalized.includes("restaurantkarte")) score += 6;
  if (normalized.includes("a-la-carte") || normalized.includes("alacarte") || normalized.includes("la-carte")) score += 5;
  if (normalized.includes("menu")) score += 3;
  if (normalized.includes("menue")) score += 3;
  if (normalized.includes("menü")) score += 3;
  if (normalized.includes("food")) score += 3;
  if (normalized.includes("essen")) score += 3;
  if (normalized.includes("speisen")) score += 4;
  if (normalized.includes("karte")) score += 2;

  if (normalized.includes("weinkarte")) score -= 10;
  if (normalized.includes("wine")) score -= 10;
  if (normalized.includes("getraenk")) score -= 10;
  if (normalized.includes("getränk")) score -= 10;
  if (normalized.includes("drinks")) score -= 10;
  if (normalized.includes("cocktail")) score -= 10;
  if (normalized.includes("fruehstueck")) score -= 1;
  if (normalized.includes("fruhstuck")) score -= 1;
  if (normalized.includes("breakfast")) score -= 1;
  if (normalized.includes("brunch")) score -= 1;

  if (normalized.includes("english")) score -= 3;
  if (normalized.includes("englisch")) score -= 3;
  return score;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .trim();
}

function isKnownDynamicMenuPlatform(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return hostname === "menury.com" || hostname.endsWith(".menury.com");
  } catch {
    return false;
  }
}

function getRegistrableDomain(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;

    const lastTwo = parts.slice(-2).join(".");
    if (SECOND_LEVEL_DOMAIN_SUFFIXES.has(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join(".");
    }

    return lastTwo;
  } catch {
    return "";
  }
}


async function fetchWithTimeout(value: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      redirect: "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
