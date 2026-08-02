import { createHash } from "crypto";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireUser } from "../../../src/auth/requireUser";
import { classifyDishRolesAI } from "../../../src/ai/classifyDishRolesAI";
import { askPickForMeImageUrlsAI } from "../../../src/ai/askPickForMeImageUrlsAI";
import { localizeRecommendationDisplayTexts } from "../../../src/ai/localizeRecommendationDisplayTexts";
import { recommendMainDishesAI, type MainDishRecommendationResult } from "../../../src/ai/recommendMainDishesAI";
import {
  isAnalyzeDiagnosticsEnabled,
  logAnalyzeOpsDiagnostic
} from "../../../src/ai/twoStepRecommendationDiagnostics";
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
import { prepareBestTildaMenuImageFallback } from "../../../src/menu/prepareTildaMenuImageFallback";
import { prepareLinkedMenuImageFallback } from "../../../src/menu/prepareLinkedMenuImageFallback";
import { preparePubhtml5MenuImages } from "../../../src/menu/preparePubhtml5MenuImageFallback";
import { loadMenuTextFromMenury, looksLikeMenuryUrl } from "../../../src/menu/loadMenuTextFromMenury";
import {
  applyDishRoleClassifications,
  getDishesNeedingRoleClassification
} from "../../../src/menu/applyDishRoleClassifications";
import {
  rankMenuSourceCandidatesByQuality,
  type MenuSourceExtractedText,
  type MenuSourceQualityMetrics
} from "../../../src/restaurant/menuSourceQuality";
import { recommendDishes } from "../../../src/recommendation/recommendDishes";
import { gatekeepMainDishRecommendations } from "../../../src/recommendation/gatekeeper";
import { enrichPriceCompatibility, type PriceResolverDiagnostics } from "../../../src/recommendation/priceCompatibility";
import { mapGatekeptMainRecommendationsToAnalyzeData } from "../../../src/recommendation/twoStepRecommendationMappers";
import { blockReasonForRecommendation } from "../../../src/profile/profileRules";
import { sanitizeProfileForRecommendation } from "../../../src/profile/profileInputPolicy";
import type { AnalyzeMenuRequest, PreferredDishRole, RequestedDishRole } from "../../../src/types/api";
import type { MenuExtractionResult } from "../../../src/menu/extraction/types";
import type { RestaurantDescriptionResult } from "../../../src/restaurant/extractRestaurantDescription";
import type { Dish } from "../../../src/types/menu";
import type { Recommendation } from "../../../src/types/recommendations";
import type { MenuLanguage, TwoStepMenuSourceInput } from "../../../src/ai/twoStepRecommendationSchemas";

type FallbackHeroContext = {
  dishes?: Dish[];
  menuType?: string;
  recommendationMode?: "single_dishes" | "whole_menu" | "sharing_menu";
  restaurantContextText?: string;
  officialWebsiteText?: string;
};

type TwoStepAnalyzeDataParts = {
  dishes: Dish[];
  recommendations: Recommendation[];
};

type OrderLabels = {
  main: string;
  starter: string;
  title: string;
  wine: string;
};

type LinkedPdfMenu = {
  url: string;
  urls?: string[];
  restaurantContextText?: string;
  pdfTextQuality?: PdfTextQualityForAnalysis;
  pdfExtractedTexts?: MenuSourceExtractedText[];
};

type PdfTextQualityForAnalysis = MenuSourceQualityMetrics & {
  usableForAnalysis: boolean;
  baseScore: number;
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
const MAX_ANALYZE_IMAGE_BASE64_LENGTH = 10_000_000;
const PRODUCTION_REQUEST_TRACE_LOGGED = Symbol("gustaro.productionRequestTraceLogged");
const UPLOADED_IMAGE_AI_TIMEOUT_MS = 70000;
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
    await requireUser(request);

    const validationStartedAt = Date.now();
    const body = (await request.json()) as AnalyzeMenuRequest;
    requestRunId = normalizeDiagnosticRunId(body.diagnosticRunId) ?? requestRunId;
    logDevAnalyzeTiming({
      runId: requestRunId,
      phase: "api.request_received",
      durationMs: 0
    });
    const outputLocale = normalizeTargetLocale(body.profile.outputLocale);
    const requestedDishRoles = normalizeRequestedDishRoles(body.requestedDishRoles);
    const preferredDishRole = requestedDishRoles.includes("starter")
      ? normalizePreferredDishRole(body.preferredDishRole)
      : undefined;
    logAnalyzeOpsDiagnostic({
      runId: requestRunId,
      phase: "validation",
      durationMs: Date.now() - validationStartedAt,
      requestedDishRoles: formatRequestedDishRolesForOps(requestedDishRoles),
      preferredDishRole,
      requestKind: getAnalyzeRequestKind(requestedDishRoles, preferredDishRole)
    });
    const legacySituation = body.situation ?? "leicht";
    const profile = sanitizeProfileForRecommendation({
      ...body.profile,
      outputLocale
    });

    if (body.sourceKind === "image") {
      const imageBase64 = validateAnalyzeImageBase64(body.imageBase64);
      const mimeType = validateAnalyzeImageMimeType(body.mimeType);
      const photoContextText = body.menuText?.trim() || "Fotografierte Speisekarte";

      if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
        throw new AppError(400, "IMAGE_AI_DISABLED", "Bild-Speisekarten benoetigen in V1 den KI-Modus.");
      }

      try {
        return await analyzeMenuWithTwoStepMainFlow({
          source: {
            kind: "image",
            urls: [`data:${mimeType};base64,${imageBase64}`],
            text: photoContextText
          },
          responseMode: "ai_image",
          profile,
          situation: body.situation,
          requestedDishRoles,
          preferredDishRole,
          outputLocale,
          userLocale: body.userLocale,
          restaurantDescription: null,
          localizedRestaurantDescription: null,
          restaurantUrl: undefined,
          fallbackHeroContextText: photoContextText,
          htmlMenuExtraction: null,
          deviceLocale: body.deviceLocale,
          extraPayload: {},
          timeoutMs: UPLOADED_IMAGE_AI_TIMEOUT_MS,
          requestStartedAt,
          runId: requestRunId,
          supportsUncertainReviewCandidates: body.supportsUncertainReviewCandidates === true
        });
      } catch (imageAiError) {
        if (imageAiError instanceof AppError) {
          throw imageAiError;
        }

        console.error("GustaroAI uploaded Image AI failed.", imageAiError);

        const message = getErrorMessage(imageAiError);

        if (isTemporaryConnectionError(imageAiError)) {
          throw new AppError(
            503,
            "CONNECTION_ERROR",
            "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
            { retryable: true }
          );
        }

        if (imageAiError instanceof SyntaxError) {
          throw new AppError(
            500,
            "AI_RESPONSE_INVALID",
            "Die KI-Antwort konnte technisch nicht verarbeitet werden."
          );
        }

        if (message.includes("TWO_STEP_MAIN_AI_TIMEOUT") || message.includes("IMAGE_AI_TIMEOUT")) {
          throw new AppError(
            504,
            "AI_TIMEOUT",
            "Die Analyse dauert gerade zu lange. Bitte versuche es gleich noch einmal.",
            { retryable: true }
          );
        }

        if (isInvalidImageAiError(imageAiError)) {
          throw new AppError(
            422,
            "IMAGE_MENU_NOT_READABLE",
            "Diese Bild-Speisekarte konnte nicht sicher gelesen werden. Bitte nutze einen direkten Link zu einer PDF-Speisekarte oder fuege den Speisekartentext ein."
          );
        }

        throw imageAiError;
      }
    }

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
    let selectedPdfMenu: Awaited<ReturnType<typeof selectPdfMenuForAnalysis>>;

    try {
      const linkedPdfMenu = !dynamicMenuText && inputLooksLikeUrl && !directPdfUrl ? await findLinkedPdfMenu(rawMenuText) : null;
      selectedPdfMenu = await selectPdfMenuForAnalysis({
        providedPdfMenuUrls,
        directPdfUrl,
        linkedPdfMenu,
        runId: requestRunId
      });
    } catch (sourceFetchError) {
      logAnalyzeOpsDiagnostic({
        runId: requestRunId,
        phase: "source_fetch",
        durationMs: Date.now() - sourceFetchStartedAt,
        requestedDishRoles: formatRequestedDishRolesForOps(requestedDishRoles),
        preferredDishRole,
        requestKind: getAnalyzeRequestKind(requestedDishRoles, preferredDishRole),
        errorClass: getAnalyzeOpsErrorClass(sourceFetchError),
        diagnosticReason: getAnalyzeOpsDiagnosticReason(sourceFetchError)
      });
      throw sourceFetchError;
    }

    logDevAnalyzeTiming({
      runId: requestRunId,
      phase: "api.source_fetch",
      durationMs: Date.now() - sourceFetchStartedAt,
      success: true
    });
    logAnalyzeOpsDiagnostic({
      runId: requestRunId,
      phase: "source_fetch",
      durationMs: Date.now() - sourceFetchStartedAt,
      requestedDishRoles: formatRequestedDishRolesForOps(requestedDishRoles),
      preferredDishRole,
      requestKind: getAnalyzeRequestKind(requestedDishRoles, preferredDishRole)
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
        const pdfSource: TwoStepMenuSourceInput & { pdfExtractedTexts?: MenuSourceExtractedText[] } = {
          kind: "pdf",
          urls: pdfMenuUrls,
          sourceUrl: pdfMenuUrl,
          text: selectedPdfMenu?.restaurantContextText ?? rawMenuText,
          pdfTextQuality: selectedPdfMenu?.pdfTextQuality,
          pdfExtractedTexts: selectedPdfMenu?.pdfExtractedTexts
        };

        return await analyzeMenuWithTwoStepMainFlow({
          source: pdfSource,
          responseMode: "ai_pdf",
          profile,
          situation: body.situation,
          requestedDishRoles,
          preferredDishRole,
          outputLocale,
          userLocale: body.userLocale,
          restaurantDescription,
          localizedRestaurantDescription,
          restaurantUrl: officialRestaurantUrl,
          fallbackHeroContextText: selectedPdfMenu?.restaurantContextText ?? rawMenuText,
          htmlMenuExtraction: null,
          starterCandidateSourceUrls: pdfMenuUrls,
          deviceLocale: body.deviceLocale,
          extraPayload: {
            ...sourceInputAllergenWarningPayload
          },
          timeoutMs: PDF_AI_TIMEOUT_MS,
          requestStartedAt,
          runId: requestRunId,
          supportsUncertainReviewCandidates: body.supportsUncertainReviewCandidates === true
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

        if (isTemporaryConnectionError(pdfAiError)) {
          throw new AppError(
            503,
            "CONNECTION_ERROR",
            "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
            { retryable: true }
          );
        }

        const attributionError = mapAttributionEvidenceError(pdfAiError);
        if (attributionError) {
          throw attributionError;
        }

        if (pdfAiError instanceof SyntaxError) {
          throw new AppError(
            500,
            "AI_RESPONSE_INVALID",
            "Die KI-Antwort konnte technisch nicht verarbeitet werden."
          );
        }

        if (message.includes("TWO_STEP_MAIN_AI_TIMEOUT")) {
          throw new AppError(
            504,
            "AI_TIMEOUT",
            "Ich brauche fuer diese PDF-Speisekarte gerade zu lange. Bitte versuche es noch einmal.",
            { retryable: true }
          );
        }

        if (
          message.includes("PDF_LOCALIZATION_FAILED") ||
          message.includes("PDF_AI_TIMEOUT")
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
          preferredDishRole,
          outputLocale,
          userLocale: body.userLocale,
          restaurantDescription,
          localizedRestaurantDescription,
          restaurantUrl: officialRestaurantUrl,
          fallbackHeroContextText: rawMenuText,
          htmlMenuExtraction: null,
          deviceLocale: body.deviceLocale,
          extraPayload: {
            ...sourceInputAllergenWarningPayload
          },
          timeoutMs: 45000,
          requestStartedAt,
          runId: requestRunId,
          supportsUncertainReviewCandidates: body.supportsUncertainReviewCandidates === true
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

        if (isTemporaryConnectionError(imageAiError)) {
          throw new AppError(
            503,
            "CONNECTION_ERROR",
            "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
            { retryable: true }
          );
        }

        const attributionError = mapAttributionEvidenceError(imageAiError);
        if (attributionError) {
          throw attributionError;
        }

        if (imageAiError instanceof SyntaxError) {
          throw new AppError(
            500,
            "AI_RESPONSE_INVALID",
            "Die KI-Antwort konnte technisch nicht verarbeitet werden."
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

    // pubhtml5.com-Flipbooks (z.B. PDF-Speisekarten, die als Umblaetter-
    // Viewer eingebettet sind) liefern serverseitig keinerlei Text - die
    // normale HTML-Extraktion und der Tilda-Bildfallback koennen diese
    // Quelle nicht erkennen. Deshalb wird hier frueh geprueft, bevor die
    // (nachweislich erfolglose) HTML-Extraktion versucht wird. Siehe
    // preparePubhtml5MenuImageFallback.ts fuer die verifizierte Herleitung
    // des Bild-URL-Musters.
    const pubhtml5MenuImages = !dynamicMenuText && inputLooksLikeUrl
      ? await preparePubhtml5MenuImages(rawMenuText)
      : null;

    if (pubhtml5MenuImages) {
      if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
        throw new AppError(400, "IMAGE_AI_DISABLED", "Bild-Speisekarten benötigen in V1 den KI-Modus.");
      }

      try {
        return await analyzeMenuWithTwoStepMainFlow({
          source: {
            kind: "image",
            urls: pubhtml5MenuImages.imageDataUrls,
            sourceUrl: rawMenuText,
            text: [pubhtml5MenuImages.title, pubhtml5MenuImages.description]
              .filter((value): value is string => Boolean(value?.trim()))
              .join("\n")
          },
          responseMode: "ai_image",
          profile,
          situation: body.situation,
          requestedDishRoles,
          preferredDishRole,
          outputLocale,
          userLocale: body.userLocale,
          restaurantDescription,
          localizedRestaurantDescription,
          restaurantUrl: officialRestaurantUrl,
          fallbackHeroContextText: [pubhtml5MenuImages.title, pubhtml5MenuImages.description]
            .filter((value): value is string => Boolean(value?.trim()))
            .join("\n"),
          htmlMenuExtraction: null,
          deviceLocale: body.deviceLocale,
          extraPayload: {
            ...sourceInputAllergenWarningPayload
          },
          timeoutMs: 60000,
          requestStartedAt,
          runId: requestRunId,
          supportsUncertainReviewCandidates: body.supportsUncertainReviewCandidates === true
        });
      } catch (imageAiError) {
        if (imageAiError instanceof AppError) {
          throw imageAiError;
        }

        console.error("GustaroAI Pubhtml5 Image AI failed.", imageAiError);

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

        if (isTemporaryConnectionError(imageAiError)) {
          throw new AppError(
            503,
            "CONNECTION_ERROR",
            "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
            { retryable: true }
          );
        }

        const attributionError = mapAttributionEvidenceError(imageAiError);
        if (attributionError) {
          throw attributionError;
        }

        if (imageAiError instanceof SyntaxError) {
          throw new AppError(
            500,
            "AI_RESPONSE_INVALID",
            "Die KI-Antwort konnte technisch nicht verarbeitet werden."
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
    const htmlMenuUsedFragmentsFallback = Boolean(htmlMenuExtraction) && !htmlMenuExtraction?.items.length;
    const htmlMenuText = htmlMenuExtraction
      ? htmlMenuExtraction.items.length
        ? htmlMenuExtractionToMenuText(htmlMenuExtraction)
        : htmlMenuExtraction.fragments.join("\n")
      : null;
    const htmlMenuDishes = htmlMenuExtraction?.items.length
      ? htmlMenuExtractionToDishes(htmlMenuExtraction)
      : null;

    if (shouldExtractHtmlMenu) {
      logDevHtmlMenuExtraction({
        phase: "html_menu_extraction",
        attempted: true,
        itemCount: htmlMenuExtraction?.items.length ?? 0,
        fragmentCount: htmlMenuExtraction?.fragments.length ?? 0,
        confidence: htmlMenuExtraction?.confidence,
        usedFragmentsFallback: htmlMenuUsedFragmentsFallback,
        firstCategories: htmlMenuExtraction?.items.slice(0, 5).map((item) => item.category ?? "none").join("|")
      });
    }

    let effectiveMenuText: string;

    try {
      effectiveMenuText = dynamicMenuText ?? htmlMenuText ?? (inputLooksLikeUrl
        ? await loadMenuTextFromUrl(menuTextUrl)
        : rawMenuText);
    } catch (menuLoadError) {
      if (isTemporaryConnectionError(menuLoadError)) {
        throw new AppError(
          503,
          "CONNECTION_ERROR",
          "Ich erreiche die Speisekarte gerade nicht. Bitte versuche es gleich noch einmal.",
          { retryable: true }
        );
      }

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

    if (shouldExtractHtmlMenu) {
      const htmlFoodDishCount = (htmlMenuDishes ?? parseMenu(effectiveMenuText)).filter(isFoodDish).length;
      const htmlPriceCount = countMenuPriceSignals(effectiveMenuText);

      if (htmlFoodDishCount === 0 && htmlPriceCount === 0) {
        const tildaImage = await prepareBestTildaMenuImageFallback(rawMenuText);

        if (tildaImage) {
          try {
            const imageAllergenWarningPayload = buildAllergenInfoWarningPayload(
              profile,
              `${rawMenuText}\n${effectiveMenuText}`,
              body.userLocale
            );

            return await analyzeMenuWithTwoStepMainFlow({
              source: {
                kind: "image",
                urls: [tildaImage.imageDataUrl],
                sourceUrl: tildaImage.originalUrl,
                text: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`
              },
              responseMode: "ai_image",
              profile,
              situation: body.situation,
              requestedDishRoles,
              preferredDishRole,
              outputLocale,
              userLocale: body.userLocale,
              restaurantDescription,
              localizedRestaurantDescription,
              restaurantUrl: officialRestaurantUrl,
              fallbackHeroContextText: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`,
              htmlMenuExtraction,
              deviceLocale: body.deviceLocale,
              extraPayload: {
                ...imageAllergenWarningPayload,
                ...buildMenuExtractionPayload(htmlMenuExtraction)
              },
              timeoutMs: 60000,
              requestStartedAt,
              runId: requestRunId,
              supportsUncertainReviewCandidates: body.supportsUncertainReviewCandidates === true
            });
          } catch (tildaImageAiError) {
            if (tildaImageAiError instanceof AppError) {
              throw tildaImageAiError;
            }

            console.error("GustaroAI Tilda Image AI failed.", tildaImageAiError);

            const message = tildaImageAiError instanceof Error ? tildaImageAiError.message : "";

            if (isRateLimitError(tildaImageAiError)) {
              throw new AppError(
                429,
                "AI_RATE_LIMIT",
                "Ich kann die Bild-Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
              );
            }

            if (isTemporaryConnectionError(tildaImageAiError)) {
              throw new AppError(
                503,
                "CONNECTION_ERROR",
                "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
                { retryable: true }
              );
            }

            const attributionError = mapAttributionEvidenceError(tildaImageAiError);
            if (attributionError) {
              throw attributionError;
            }

            if (tildaImageAiError instanceof SyntaxError) {
              throw new AppError(
                500,
                "AI_RESPONSE_INVALID",
                "Die KI-Antwort konnte technisch nicht verarbeitet werden."
              );
            }

            if (message.includes("TWO_STEP_MAIN_AI_TIMEOUT")) {
              throw new AppError(
                504,
                "AI_TIMEOUT",
                "Ich brauche fuer diese Bild-Speisekarte gerade zu lange. Bitte versuche es noch einmal.",
                { retryable: true }
              );
            }

            if (message.includes("IMAGE_AI_TIMEOUT")) {
              throw new AppError(
                422,
                "ANALYSIS_NOT_SAFE",
                "Ich konnte diese Bild-Speisekarte nicht sicher auswerten."
              );
            }

            if (isInvalidImageAiError(tildaImageAiError)) {
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

            throw tildaImageAiError;
          }
        }

        // Generischer Bild-Fallback fuer Websites ohne Tilda-/pubhtml5-
        // Plattformmuster, deren Speisekarte trotzdem nur als Bild(er)
        // eingebunden ist (Fallanalyse "sonnenalm.de", Juli 2026). Nutzt
        // dieselbe Two-Step-Pipeline mit Attribution-Evidence-Pruefung und
        // Sicherheits-Verifier wie Text-/PDF-Speisekarten - kein
        // unverifizierter Einzel-Vision-Call. Deckt bewusst nur Speisen ab:
        // findLinkedMenuImageUrls schliesst Wein-/Getraenkebilder gezielt
        // aus (Score -10 fuer "wein"/"getraenk"), Weinkarten-aus-Bild ist
        // ein separates, hier nicht behandeltes Thema.
        const linkedMenuImages = await prepareLinkedMenuImageFallback(rawMenuText);

        if (linkedMenuImages) {
          try {
            const imageAllergenWarningPayload = buildAllergenInfoWarningPayload(
              profile,
              `${rawMenuText}\n${effectiveMenuText}`,
              body.userLocale
            );

            return await analyzeMenuWithTwoStepMainFlow({
              source: {
                kind: "image",
                urls: linkedMenuImages.imageDataUrls,
                sourceUrl: linkedMenuImages.originalUrls[0] ?? rawMenuText,
                text: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`
              },
              responseMode: "ai_image",
              profile,
              situation: body.situation,
              requestedDishRoles,
              preferredDishRole,
              outputLocale,
              userLocale: body.userLocale,
              restaurantDescription,
              localizedRestaurantDescription,
              restaurantUrl: officialRestaurantUrl,
              fallbackHeroContextText: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`,
              htmlMenuExtraction,
              deviceLocale: body.deviceLocale,
              extraPayload: {
                ...imageAllergenWarningPayload,
                ...buildMenuExtractionPayload(htmlMenuExtraction)
              },
              timeoutMs: 60000,
              requestStartedAt,
              runId: requestRunId,
              supportsUncertainReviewCandidates: body.supportsUncertainReviewCandidates === true
            });
          } catch (linkedImageAiError) {
            if (linkedImageAiError instanceof AppError) {
              throw linkedImageAiError;
            }

            console.error("GustaroAI Linked Menu Image AI failed.", linkedImageAiError);

            const message = linkedImageAiError instanceof Error ? linkedImageAiError.message : "";

            if (isRateLimitError(linkedImageAiError)) {
              throw new AppError(
                429,
                "AI_RATE_LIMIT",
                "Ich kann die Bild-Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal."
              );
            }

            if (isTemporaryConnectionError(linkedImageAiError)) {
              throw new AppError(
                503,
                "CONNECTION_ERROR",
                "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
                { retryable: true }
              );
            }

            const attributionError = mapAttributionEvidenceError(linkedImageAiError);
            if (attributionError) {
              throw attributionError;
            }

            if (linkedImageAiError instanceof SyntaxError) {
              throw new AppError(
                500,
                "AI_RESPONSE_INVALID",
                "Die KI-Antwort konnte technisch nicht verarbeitet werden."
              );
            }

            if (message.includes("TWO_STEP_MAIN_AI_TIMEOUT")) {
              throw new AppError(
                504,
                "AI_TIMEOUT",
                "Ich brauche fuer diese Bild-Speisekarte gerade zu lange. Bitte versuche es noch einmal.",
                { retryable: true }
              );
            }

            if (message.includes("IMAGE_AI_TIMEOUT")) {
              throw new AppError(
                422,
                "ANALYSIS_NOT_SAFE",
                "Ich konnte diese Bild-Speisekarte nicht sicher auswerten."
              );
            }

            if (isInvalidImageAiError(linkedImageAiError)) {
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

            throw linkedImageAiError;
          }
        }

        // Weder die strukturierte HTML-Extraktion noch einer der
        // Bild-Fallbacks (Tilda, generischer Bild-Fund) konnten die
        // Speisekarte inhaltlich fuellen: htmlMenuExtraction ist zwar nicht
        // null, aber leer (0 Gerichte). Ohne diese Sperre wuerde der duenne
        // Fragments-Text (nur Navigations-Ueberschriften) direkt an die
        // Text-KI gehen, die dann plausibel klingende, aber frei erfundene
        // Gerichte samt Preis ausgegeben hat - derselbe Fehlerfall, der beim
        // Foto-Speisekarten-Eingang zur Abschaltung gefuehrt hat
        // (Fallanalyse "sonnenalm.de", Juli 2026). Bei null gefundenen
        // Gerichten und keinem auswertbaren Bild lieber ehrlich abbrechen,
        // statt zu raten.
        if (htmlMenuExtraction && htmlMenuExtraction.items.length === 0) {
          throw new AppError(
            422,
            "MENU_URL_UNREADABLE",
            "Diese Speisekarte konnte ich nicht zuverlässig auslesen – vermutlich, weil sie nur als Bild ohne Text vorliegt. Bitte füge den Speisekartentext manuell ein."
          );
        }
      }
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
        preferredDishRole,
        outputLocale,
        userLocale: body.userLocale,
        restaurantDescription,
        localizedRestaurantDescription,
        restaurantUrl: officialRestaurantUrl,
        fallbackHeroContextText: `${rawMenuText}\n${effectiveMenuText.slice(0, 3000)}`,
        htmlMenuExtraction,
        deviceLocale: body.deviceLocale,
        extraPayload: {
          ...textAllergenWarningPayload,
          ...buildMenuExtractionPayload(htmlMenuExtraction)
        },
        timeoutMs: TEXT_AI_TIMEOUT_MS,
        requestStartedAt,
        runId: requestRunId,
        supportsUncertainReviewCandidates: body.supportsUncertainReviewCandidates === true
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

      if (isTemporaryConnectionError(aiError)) {
        throw new AppError(
          503,
          "CONNECTION_ERROR",
          "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
          { retryable: true }
        );
      }

      const attributionError = mapAttributionEvidenceError(aiError);
      if (attributionError) {
        throw attributionError;
      }

      if (aiError instanceof SyntaxError) {
        throw new AppError(
          500,
          "AI_RESPONSE_INVALID",
          "Die KI-Antwort konnte technisch nicht verarbeitet werden."
        );
      }

      if (message.includes("TWO_STEP_MAIN_AI_TIMEOUT")) {
        throw new AppError(
          504,
          "AI_TIMEOUT",
          "Ich brauche fuer diese Speisekarte gerade zu lange. Bitte versuche es noch einmal.",
          { retryable: true }
        );
      }

      if (message.includes("TEXT_AI_TIMEOUT")) {
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

    // ACHTUNG - unerreichbarer Legacy-Code (Stand: Codereview Juli 2026):
    // Der try-Block direkt oberhalb ruft ausschliesslich
    // analyzeMenuWithTwoStepMainFlow(...) auf und endet in jedem Fall mit
    // einem return (Erfolg) oder einem throw im zugehoerigen catch (jeder
    // Fehlerfall wird dort explizit abgefangen und weitergereicht). Es gibt
    // aktuell keinen Kontrollfluss, der von hier aus erreicht werden kann.
    // Der folgende "fallback"-Zweig (inkl. recommendDishes() ohne Attribution
    // Validator) laeuft deshalb im Produktivbetrieb nicht mehr mit.
    // Absichtlich noch nicht entfernt: der Block ist ca. 234 Zeilen gross und
    // beruehrt mehrere mitbenutzte Funktionen (askPickForMeImageUrlsAI,
    // applyAllergySafetyGate, classifyUnclearDishRoles, recommendDishes).
    // Entfernen ist ein bewusst separat freizugebender, groesserer Schnitt,
    // kein Nebeneffekt eines anderen Tasks. Siehe Codereview-Notiz Juli 2026.
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
              orderLabels: buildOrderLabelsForMenuLanguage(undefined),
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

          if (isTemporaryConnectionError(imageAiError)) {
            throw new AppError(
              503,
              "CONNECTION_ERROR",
              "Ich erreiche den Service gerade nicht. Bitte versuche es gleich noch einmal.",
              { retryable: true }
            );
          }

          if (imageAiError instanceof SyntaxError) {
            throw new AppError(
              500,
              "AI_RESPONSE_INVALID",
              "Die KI-Antwort konnte technisch nicht verarbeitet werden."
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
        orderLabels: buildOrderLabelsForMenuLanguage(undefined),
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
    logAnalyzeOpsDiagnostic({
      runId: requestRunId,
      phase: "total",
      durationMs: Date.now() - requestStartedAt,
      httpStatus: error instanceof AppError ? error.status : 500,
      errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      errorClass: getAnalyzeOpsErrorClass(error),
      diagnosticReason: getAnalyzeOpsDiagnosticReason(error)
    });
    if (!isProductionRequestTraceLogged(error)) {
      logProductionRequestTrace({
        requestId: requestRunId,
        runId: requestRunId,
        analysisMode: "unknown",
        sourceKind: "unknown",
        sourceHash: "",
        primaryLikeCount: 0,
        allergenCount: 0,
        customExclusionCount: 0,
        restrictionCount: 0,
        hasLactoseCanonicalRule: false,
        supportsUncertainReviewCandidates: false,
        uncertainReviewFeatureEnabled: isUncertainReviewFeatureEnabled(),
        mainCandidateCount: 0,
        safeCount: 0,
        uncertainCount: 0,
        conflictCount: 0,
        invalidCount: 0,
        ...buildProductionMainFunnelTraceFields(),
        ...buildProductionSafetyTraceFields(),
        ...buildProductionPriceResolverTraceFields(),
        finalSafeCount: 0,
        reviewCandidateCount: 0,
        reviewReturnedCount: 0,
        recommendationResultType: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        httpStatus: error instanceof AppError ? error.status : 500,
        totalDurationMs: Date.now() - requestStartedAt
      });
    }
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

    // RECOMMENDATION_TRANSLATION_FAILED/_RATE_LIMIT wurden frueher als
    // fail-closed (422, ganze Analyse verworfen) behandelt. Root cause laut
    // Analyse vom 2026-07-27: localizeRecommendationDisplayTexts() respektiert
    // die Main-AI-Uebersetzung bereits, scheitert aber am selben zu engen
    // Sprach-Validierungs-Gate wie die Reparatur-AI (z.B. bereits deutsche
    // Texte ohne Umlaut/aus der festen Wortliste, wie "vegetarisch"). Die
    // eigentliche Empfehlung (inkl. Safety-Verifier) ist zu diesem Zeitpunkt
    // bereits fertig und sicher geprueft - nur die Anzeige-Uebersetzung ist
    // betroffen. Deshalb hier wie bei jedem anderen Uebersetzungsfehler ueber
    // den bestehenden Fallback einzelne unsichere Uebersetzungsfelder
    // entfernen, statt die ganze Empfehlung wegzuwerfen.
    return stripUnsafeRecommendationTranslations(input.recommendations, input.dishes, input.userLocale);
  }
}

// Der Bestellscreen richtet sich an das Restaurantpersonal, nicht an den
// App-Nutzer - die Ueberschriften sollen deshalb ausschliesslich von der
// Speisekarten-Sprache abhaengen, nie von der Nutzer-/GUI-Sprache. Deutsch
// nur, wenn die Speisekarte nachweislich deutsch ist; jede andere/unbekannte
// Sprache faellt auf Englisch zurueck (naeher an einer international
// verstaendlichen Lingua franca als Deutsch).
function buildOrderLabelsForMenuLanguage(menuLanguage: MenuLanguage | undefined): OrderLabels {
  switch (menuLanguage) {
    case "es":
      return { title: "Orden", starter: "Entrada", main: "Plato fuerte", wine: "Vino" };
    case "it":
      return { title: "Ordine", starter: "Antipasto", main: "Piatto principale", wine: "Vino" };
    case "fr":
      return { title: "Commande", starter: "Entree", main: "Plat principal", wine: "Vin" };
    case "id":
      return { title: "Pesanan", starter: "Hidangan pembuka", main: "Hidangan utama", wine: "Anggur" };
    case "ru":
      return {
        title: "\u0417\u0430\u043a\u0430\u0437",
        starter: "\u0417\u0430\u043a\u0443\u0441\u043a\u0430",
        main: "\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0435 \u0431\u043b\u044e\u0434\u043e",
        wine: "\u0412\u0438\u043d\u043e"
      };
    case "en":
      return { title: "Order", starter: "Starter", main: "Main dish", wine: "Wine" };
    case "de":
      return { title: "Bestellung", starter: "Vorspeise", main: "Hauptspeise", wine: "Wein" };
    case "unknown":
    default:
      return { title: "Order", starter: "Starter", main: "Main dish", wine: "Wine" };
  }
}

type TwoStepAnalyzeResponseMode = "ai" | "ai_pdf" | "ai_image";

async function analyzeMenuWithTwoStepMainFlow({
  source,
  responseMode,
  profile,
  situation,
  requestedDishRoles,
  preferredDishRole,
  outputLocale,
  userLocale,
  restaurantDescription,
  localizedRestaurantDescription,
  restaurantUrl,
  fallbackHeroContextText,
  htmlMenuExtraction,
  starterCandidateSourceUrls = [],
  deviceLocale,
  extraPayload = {},
  timeoutMs,
  requestStartedAt,
  runId,
  supportsUncertainReviewCandidates
}: {
  source: TwoStepMenuSourceInput;
  responseMode: TwoStepAnalyzeResponseMode;
  profile: AnalyzeMenuRequest["profile"];
  situation?: AnalyzeMenuRequest["situation"];
  requestedDishRoles: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  outputLocale: string;
  userLocale?: string;
  restaurantDescription: RestaurantDescriptionResult | null;
  localizedRestaurantDescription: LocalizedRestaurantDescriptionResult | null;
  restaurantUrl?: string;
  fallbackHeroContextText: string;
  htmlMenuExtraction: MenuExtractionResult | null;
  starterCandidateSourceUrls?: string[];
  deviceLocale?: string;
  extraPayload?: Record<string, unknown>;
  timeoutMs: number;
  requestStartedAt: number;
  runId: string;
  supportsUncertainReviewCandidates?: boolean;
}) {
  const flowStartedAt = Date.now();
  const sourceKind = source.kind;
  const sourceCount = getTwoStepMainSourceCount(source);
  const requestKind = getAnalyzeRequestKind(requestedDishRoles, preferredDishRole);
  const opsBase = {
    runId,
    responseMode,
    sourceKind,
    requestedDishRoles: formatRequestedDishRolesForOps(requestedDishRoles),
    preferredDishRole,
    requestKind
  };
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
  let mainDishResult: MainDishRecommendationResult;
  let proposedMainDishes: MainDishRecommendationResult["recommendations"];
  let mainAiDurationMs = 0;

  const mainStartedAt = Date.now();
  try {
    mainDishResult = await withAbortTimeout(
      (signal) => recommendMainDishesAI({
        source: augmentedSourceForMainAi,
        profile,
        situation,
        requestedDishRoles,
        preferredDishRole,
        userLocale: outputLocale,
        runId,
        signal
      }),
      timeoutMs,
      "TWO_STEP_MAIN_AI_TIMEOUT"
    );
    proposedMainDishes = mainDishResult.recommendations;
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
    logAnalyzeOpsDiagnostic({
      ...opsBase,
      phase: "main_ai_request",
      durationMs: mainAiDurationMs,
      candidateCount: proposedMainDishes.length,
      recommendationCount: proposedMainDishes.length
    });
  } catch (error) {
    const controlledError = mapStarterSaladInvalidMainAiSchemaError(error, requestedDishRoles);
    logTwoStepMainError({
      phase: "main-ai-error",
      runId,
      responseMode,
      sourceKind,
      sourceCount,
      durationMs: Date.now() - mainStartedAt,
      error: controlledError
    });
    logAnalyzeOpsDiagnostic({
      ...opsBase,
      phase: "main_ai_request",
      durationMs: Date.now() - mainStartedAt,
      errorClass: getAnalyzeOpsErrorClass(controlledError),
      diagnosticReason: getAnalyzeOpsDiagnosticReason(controlledError)
    });
    throw controlledError;
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
  logAnalyzeOpsDiagnostic({
    ...opsBase,
    phase: "gatekeeper",
    durationMs: gatekeeperDurationMs,
    candidateCount: proposedMainDishes.length,
    recommendationCount: gatekeeperResult.accepted.length,
    diagnosticReason: gatekeeperResult.accepted.length === 0 ? "gatekeeper_removed_all" : undefined
  });

  const mapperStartedAt = Date.now();
  const mappedWithoutPriceCompatibility = enrichMappedHtmlDescriptions(
    mapGatekeptMainRecommendationsToAnalyzeData(gatekeeperResult.accepted, requestedDishRoles),
    htmlMenuExtraction,
    outputLocale
  );
  const mapped = await enrichPriceCompatibility({
    acceptedRecommendations: gatekeeperResult.accepted,
    data: mappedWithoutPriceCompatibility,
    deviceLocale,
    menuLanguage: mainDishResult.menuLanguage,
    sourceContext: [
      augmentedSourceForMainAi.sourceUrl,
      augmentedSourceForMainAi.text,
      restaurantUrl,
      fallbackHeroContextText
    ].filter(Boolean).join("\n"),
    targetLocale: outputLocale
  });
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
  logAnalyzeOpsDiagnostic({
    ...opsBase,
    phase: "mapper",
    durationMs: mapperDurationMs,
    candidateCount: gatekeeperResult.accepted.length,
    recommendationCount: mapped.recommendations.length
  });

  if (mapped.recommendations.length === 0) {
    const reviewResponse = buildUncertainReviewResponse({
      candidates: mainDishResult.uncertainReviewCandidates,
      source,
      productionTrace: mainDishResult.productionTrace,
      menuLanguage: mainDishResult.menuLanguage,
      localizedRestaurantDescription,
      htmlMenuExtraction,
      profile,
      requestedDishRoles,
      preferredDishRole,
      responseMode,
      sourceKind,
      sourceCount,
      fallbackHeroContextText,
      extraPayload,
      runId,
      outputLocale,
      requestStartedAt,
      flowStartedAt,
      mainAiDurationMs,
      supportsUncertainReviewCandidates
    });

    if (reviewResponse) {
      return reviewResponse;
    }

    const error = new AppError(
      422,
      "NO_SAFE_RECOMMENDATIONS",
      "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
      buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
    );
    logNoSafeProductionRequestTrace({
      error,
      runId,
      responseMode,
      source,
      profile,
      requestedDishRoles,
      preferredDishRole,
      supportsUncertainReviewCandidates,
      mainDishResult,
      finalSafeCount: 0,
      requestStartedAt
    });
    throw error;
  }

  const allergySafeRecommendations = applyAllergySafetyGate({
    dishes: mapped.dishes,
    recommendations: mapped.recommendations,
    profile
  });

  if (allergySafeRecommendations.length === 0) {
    const reviewResponse = buildUncertainReviewResponse({
      candidates: mainDishResult.uncertainReviewCandidates,
      source,
      productionTrace: mainDishResult.productionTrace,
      menuLanguage: mainDishResult.menuLanguage,
      localizedRestaurantDescription,
      htmlMenuExtraction,
      profile,
      requestedDishRoles,
      preferredDishRole,
      responseMode,
      sourceKind,
      sourceCount,
      fallbackHeroContextText,
      extraPayload,
      runId,
      outputLocale,
      requestStartedAt,
      flowStartedAt,
      mainAiDurationMs,
      supportsUncertainReviewCandidates
    });

    if (reviewResponse) {
      return reviewResponse;
    }

    const error = new AppError(
      422,
      "NO_SAFE_RECOMMENDATIONS",
      "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.",
      buildMenuAnalysisDetails(localizedRestaurantDescription, htmlMenuExtraction)
    );
    logNoSafeProductionRequestTrace({
      error,
      runId,
      responseMode,
      source,
      profile,
      requestedDishRoles,
      preferredDishRole,
      supportsUncertainReviewCandidates,
      mainDishResult,
      finalSafeCount: 0,
      requestStartedAt
    });
    throw error;
  }

  const localizedRecommendations = await localizeRecommendationsForPayload({
    dishes: mapped.dishes,
    recommendations: allergySafeRecommendations,
    userLocale: outputLocale,
    menuLanguage: mainDishResult.menuLanguage
  });

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

  const orderLabels = buildOrderLabelsForMenuLanguage(mainDishResult.menuLanguage);

  const responseSerializationStartedAt = Date.now();
  // Token-Optimierung Juli 2026: reusableMenuText wird NUR fuer sourceKind
  // "text"/"html" gesetzt - das ist der einzige Aufrufpunkt dieser Funktion,
  // an dem source.text/source.kind exakt dem entspricht, was tatsaechlich an
  // die Haupt-KI ging (kein PDF-Datei-Anhang, kein Bild-Fallback dazwischen).
  // Der Mobile-Client kann diesen Text bei einer zweiten Analyse desselben
  // Menues (z.B. "Vorspeisen suchen") anstelle der urspruenglichen URL
  // senden und spart damit den kompletten Re-Fetch/Re-Parse. PDF- und
  // Bild-Quellen bleiben bewusst unveraendert (siehe Diagnose Juli 2026):
  // bei PDF liegt der extrahierte Text tief in der Pipeline und muesste
  // separat herausgereicht werden, bei Bildern gibt es gar keinen
  // rollen-unabhaengigen Text-Zwischenschritt (Vision-Call liefert direkt
  // rollen-beschraenkte Kandidaten, ein Wiederverwenden wuerde z.B.
  // Vorspeisen verlieren, die im ersten "main"-Aufruf nie erfasst wurden).
  const reusableMenuText = (sourceKind === "text" || sourceKind === "html") && source.text
    ? { reusableMenuText: source.text }
    : {};
  const response = NextResponse.json({
    ok: true,
    data: {
      mode: responseMode,
      menuLanguage: mainDishResult.menuLanguage,
      orderLabels,
      dishes: mapped.dishes,
      recommendations: localizedRecommendations,
      conciergeHero,
      ...reusableMenuText,
      ...extraPayload,
      ...buildRestaurantDescriptionPayload(localizedRestaurantDescription)
    }
  });
  logProductionRequestTrace({
    ...buildProductionRequestTraceBase({
      runId,
      responseMode,
      source,
      profile,
      requestedDishRoles,
      preferredDishRole,
      supportsUncertainReviewCandidates
    }),
    mainCandidateCount: mainDishResult.productionTrace?.mainCandidateCount ?? proposedMainDishes.length,
    restrictionCount: mainDishResult.productionTrace?.restrictionCount ?? countHardRestrictions(profile),
    safeCount: mainDishResult.productionTrace?.safeCount ?? proposedMainDishes.length,
    uncertainCount: mainDishResult.productionTrace?.uncertainCount ?? 0,
    conflictCount: mainDishResult.productionTrace?.conflictCount ?? 0,
    invalidCount: mainDishResult.productionTrace?.invalidCount ?? 0,
    ...buildProductionMainFunnelTraceFields(mainDishResult.productionTrace),
    ...buildProductionSafetyTraceFields(mainDishResult.productionTrace),
    ...buildProductionPriceResolverTraceFields(mapped.priceResolverDiagnostics),
    finalSafeCount: localizedRecommendations.length,
    reviewCandidateCount: mainDishResult.uncertainReviewCandidates.length,
    reviewReturnedCount: 0,
    recommendationResultType: "standard",
    httpStatus: 200,
    totalDurationMs: Date.now() - requestStartedAt
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
  logAnalyzeOpsDiagnostic({
    ...opsBase,
    phase: "total",
    durationMs: Date.now() - requestStartedAt,
    httpStatus: 200,
    recommendationCount: localizedRecommendations.length
  });

  return response;
}

function buildUncertainReviewResponse({
  candidates,
  source,
  productionTrace,
  menuLanguage,
  localizedRestaurantDescription,
  htmlMenuExtraction,
  profile,
  requestedDishRoles,
  preferredDishRole,
  responseMode,
  sourceKind,
  sourceCount,
  fallbackHeroContextText,
  extraPayload,
  runId,
  outputLocale,
  requestStartedAt,
  flowStartedAt,
  mainAiDurationMs,
  supportsUncertainReviewCandidates
}: {
  candidates: MainDishRecommendationResult["uncertainReviewCandidates"];
  source: TwoStepMenuSourceInput;
  productionTrace: MainDishRecommendationResult["productionTrace"];
  menuLanguage: MainDishRecommendationResult["menuLanguage"];
  localizedRestaurantDescription: LocalizedRestaurantDescriptionResult | null;
  htmlMenuExtraction: MenuExtractionResult | null;
  profile: AnalyzeMenuRequest["profile"];
  requestedDishRoles: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  responseMode: TwoStepAnalyzeResponseMode;
  sourceKind: TwoStepMenuSourceInput["kind"];
  sourceCount: number;
  fallbackHeroContextText: string;
  extraPayload: Record<string, unknown>;
  runId: string;
  outputLocale: string;
  requestStartedAt: number;
  flowStartedAt: number;
  mainAiDurationMs: number;
  supportsUncertainReviewCandidates?: boolean;
}) {
  if (!isUncertainReviewFeatureEnabled() || supportsUncertainReviewCandidates !== true) {
    return null;
  }

  const mapped = mapUncertainReviewCandidatesToAnalyzeData(candidates, requestedDishRoles, outputLocale);
  const allergySafeRecommendations = applyAllergySafetyGate({
    dishes: mapped.dishes,
    recommendations: mapped.recommendations,
    profile
  });

  if (allergySafeRecommendations.length === 0) {
    return null;
  }

  const allowedDishIds = new Set(allergySafeRecommendations.map((recommendation) => recommendation.dishId));
  const dishes = mapped.dishes.filter((dish) => allowedDishIds.has(dish.id));
  const conciergeHero = buildFallbackConciergeHero({
    dishes,
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

  logAnalyzeOpsDiagnostic({
    runId,
    phase: "uncertain_review",
    candidateCount: candidates.length,
    recommendationCount: allergySafeRecommendations.length
  });

  const response = NextResponse.json({
    ok: true,
    data: {
      mode: responseMode,
      recommendationResultType: "uncertain_review" as const,
      orderLabels: buildOrderLabelsForMenuLanguage(menuLanguage),
      dishes,
      recommendations: allergySafeRecommendations,
      conciergeHero,
      ...extraPayload,
      ...buildRestaurantDescriptionPayload(localizedRestaurantDescription),
      ...buildMenuExtractionPayload(htmlMenuExtraction)
    }
  });
  logProductionRequestTrace({
    ...buildProductionRequestTraceBase({
      runId,
      responseMode,
      source,
      profile,
      requestedDishRoles,
      preferredDishRole,
      supportsUncertainReviewCandidates
    }),
    mainCandidateCount: productionTrace?.mainCandidateCount ?? 0,
    restrictionCount: productionTrace?.restrictionCount ?? countHardRestrictions(profile),
    safeCount: productionTrace?.safeCount ?? 0,
    uncertainCount: productionTrace?.uncertainCount ?? 0,
    conflictCount: productionTrace?.conflictCount ?? 0,
    invalidCount: productionTrace?.invalidCount ?? 0,
    ...buildProductionMainFunnelTraceFields(productionTrace),
    ...buildProductionSafetyTraceFields(productionTrace),
    ...buildProductionPriceResolverTraceFields(),
    finalSafeCount: 0,
    reviewCandidateCount: candidates.length,
    reviewReturnedCount: allergySafeRecommendations.length,
    recommendationResultType: "uncertain_review",
    httpStatus: 200,
    totalDurationMs: Date.now() - requestStartedAt
  });

  logDevAnalyzeTiming({
    runId,
    phase: "api.total",
    durationMs: Date.now() - requestStartedAt,
    success: true
  });
  logAnalyzeOpsDiagnostic({
    runId,
    phase: "total",
    durationMs: Date.now() - requestStartedAt,
    httpStatus: 200,
    recommendationCount: allergySafeRecommendations.length
  });

  return response;
}

type ProductionRequestTraceResultType =
  | "standard"
  | "uncertain_review"
  | "NO_SAFE_RECOMMENDATIONS"
  | "INTERNAL_ERROR"
  | string;

type ProductionRequestTraceFields = {
  requestId: string;
  runId: string;
  analysisMode: string;
  sourceKind: string;
  sourceHash: string;
  primaryLikeCount: number;
  allergenCount: number;
  customExclusionCount: number;
  restrictionCount: number;
  hasLactoseCanonicalRule: boolean;
  supportsUncertainReviewCandidates: boolean;
  uncertainReviewFeatureEnabled: boolean;
  mainCandidateCount: number;
  safeCount: number;
  uncertainCount: number;
  conflictCount: number;
  invalidCount: number;
  mainRawOutputItemCount: number;
  mainParsedCandidateCount: number;
  mainInvalidStructureCount: number;
  mainMissingNameCount: number;
  mainMissingRoleCount: number;
  mainInvalidRoleCount: number;
  mainParseFailureCount: number;
  mainEmptyResponseCount: number;
  mainExceptionCount: number;
  mainTimeoutCount: number;
  mainTruncatedOrIncompleteCount: number;
  mainNormalizedCandidateCount: number;
  mainCourseFilteredCount: number;
  mainRoleFilteredCount: number;
  mainDuplicateCandidateCount: number;
  mainMissingDescriptionCount: number;
  mainMissingEvidenceCount: number;
  mainInvalidCandidateCount: number;
  mainHardRestrictionPrefilteredCount: number;
  mainPreferenceMatchedCount: number;
  mainPreferenceUnmatchedCount: number;
  mainPreferenceMultiMatchedCount: number;
  mainPreferenceEvidenceMissingCount: number;
  mainCandidateLimit: number;
  mainCandidateCountBeforeLimit: number;
  mainCandidateLimitDropCount: number;
  mainCandidateCountAfterLimit: number;
  mainCandidatesSentToSafetyCount: number;
  mainResponseStatusKnown: boolean;
  mainIncompleteStatusKnown: boolean;
  mainOutputTokenLimitReached: boolean;
  mainRefusalCount: number;
  mainRawOutputCount: number;
  safetyRequestedCandidateCount: number;
  mainCandidateIdCount: number;
  mainUniqueCandidateIdCount: number;
  safetyReturnedCandidateIdCount: number;
  safetyReturnedCheckCount: number;
  safetyUniqueReturnedCandidateIdCount: number;
  safetyMissingCandidateCount: number;
  safetyDuplicateCandidateIdCount: number;
  safetyUnknownCandidateIdCount: number;
  safetyMissingVerdictCount: number;
  safetyInvalidVerdictCount: number;
  safetyInvalidSchemaCount: number;
  safetyParseFailureCount: number;
  safetyExceptionCount: number;
  safetyTimeoutCount: number;
  safetyEmptyResponseCount: number;
  safetyTruncatedOrIncompleteCount: number;
  priceResolverEvaluatedCount: number;
  priceResolverSkippedCount: number;
  priceResolverMxnCount: number;
  priceResolverUsdCount: number;
  priceResolverUnknownCount: number;
  priceResolverExplicitCount: number;
  priceResolverContextCount: number;
  priceResolverApproxGeneratedCount: number;
  priceResolverApproxMissingCount: number;
  priceResolverMexicoMarkerCount: number;
  priceResolverMexicanPesoMarkerCount: number;
  priceResolverMxDomainMarkerCount: number;
  finalSafeCount: number;
  reviewCandidateCount: number;
  reviewReturnedCount: number;
  recommendationResultType: ProductionRequestTraceResultType;
  httpStatus: number;
  totalDurationMs: number;
  mainStarterRoleCount?: number;
  mainSaladRoleCount?: number;
  mainSideRoleCount?: number;
  mainSoupRoleCount?: number;
  mainOtherRoleCount?: number;
  mainStandaloneDishCount?: number;
  mainNonStandaloneDishCount?: number;
  mainMissingRoleClassificationCount?: number;
  mainInvalidRoleClassificationCount?: number;
};

function buildProductionRequestTraceBase({
  runId,
  responseMode,
  source,
  profile,
  requestedDishRoles,
  preferredDishRole,
  supportsUncertainReviewCandidates
}: {
  runId: string;
  responseMode: TwoStepAnalyzeResponseMode;
  source: TwoStepMenuSourceInput;
  profile: AnalyzeMenuRequest["profile"];
  requestedDishRoles: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  supportsUncertainReviewCandidates?: boolean;
}) {
  return {
    requestId: runId,
    runId,
    analysisMode: `${responseMode}:${getAnalyzeRequestKind(requestedDishRoles, preferredDishRole)}`,
    sourceKind: source.kind,
    sourceHash: buildProductionSourceHash(source),
    primaryLikeCount: stringArrayValue(profile.primaryLikes).length,
    allergenCount: stringArrayValue(profile.allergens).length,
    customExclusionCount: stringArrayValue(profile.customExclusions).length,
    restrictionCount: countHardRestrictions(profile),
    hasLactoseCanonicalRule: hasLactoseCanonicalRule(profile),
    supportsUncertainReviewCandidates: supportsUncertainReviewCandidates === true,
    uncertainReviewFeatureEnabled: isUncertainReviewFeatureEnabled()
  };
}

function logNoSafeProductionRequestTrace({
  error,
  runId,
  responseMode,
  source,
  profile,
  requestedDishRoles,
  preferredDishRole,
  supportsUncertainReviewCandidates,
  mainDishResult,
  finalSafeCount,
  requestStartedAt
}: {
  error: AppError;
  runId: string;
  responseMode: TwoStepAnalyzeResponseMode;
  source: TwoStepMenuSourceInput;
  profile: AnalyzeMenuRequest["profile"];
  requestedDishRoles: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  supportsUncertainReviewCandidates?: boolean;
  mainDishResult: MainDishRecommendationResult;
  finalSafeCount: number;
  requestStartedAt: number;
}) {
  logProductionRequestTrace({
    ...buildProductionRequestTraceBase({
      runId,
      responseMode,
      source,
      profile,
      requestedDishRoles,
      preferredDishRole,
      supportsUncertainReviewCandidates
    }),
    mainCandidateCount: mainDishResult.productionTrace?.mainCandidateCount ?? mainDishResult.recommendations.length,
    restrictionCount: mainDishResult.productionTrace?.restrictionCount ?? countHardRestrictions(profile),
    safeCount: mainDishResult.productionTrace?.safeCount ?? mainDishResult.recommendations.length,
    uncertainCount: mainDishResult.productionTrace?.uncertainCount ?? 0,
    conflictCount: mainDishResult.productionTrace?.conflictCount ?? 0,
    invalidCount: mainDishResult.productionTrace?.invalidCount ?? 0,
    ...buildProductionMainFunnelTraceFields(mainDishResult.productionTrace),
    ...buildProductionSafetyTraceFields(mainDishResult.productionTrace),
    ...buildProductionPriceResolverTraceFields(),
    finalSafeCount,
    reviewCandidateCount: mainDishResult.uncertainReviewCandidates.length,
    reviewReturnedCount: 0,
    recommendationResultType: error.code,
    httpStatus: error.status,
    totalDurationMs: Date.now() - requestStartedAt
  });
  markProductionRequestTraceLogged(error);
}

function logProductionRequestTrace(fields: ProductionRequestTraceFields) {
  if (process.env.GUSTARO_PRODUCTION_REQUEST_TRACE !== "true") {
    return;
  }

  console.info(`[gustaro-production-request-trace] ${JSON.stringify(fields)}`);
}

function buildProductionMainFunnelTraceFields(productionTrace?: MainDishRecommendationResult["productionTrace"]) {
  return {
    mainRawOutputItemCount: productionTrace?.mainRawOutputItemCount ?? 0,
    mainParsedCandidateCount: productionTrace?.mainParsedCandidateCount ?? 0,
    mainInvalidStructureCount: productionTrace?.mainInvalidStructureCount ?? 0,
    mainMissingNameCount: productionTrace?.mainMissingNameCount ?? 0,
    mainMissingRoleCount: productionTrace?.mainMissingRoleCount ?? 0,
    mainInvalidRoleCount: productionTrace?.mainInvalidRoleCount ?? 0,
    mainParseFailureCount: productionTrace?.mainParseFailureCount ?? 0,
    mainEmptyResponseCount: productionTrace?.mainEmptyResponseCount ?? 0,
    mainExceptionCount: productionTrace?.mainExceptionCount ?? 0,
    mainTimeoutCount: productionTrace?.mainTimeoutCount ?? 0,
    mainTruncatedOrIncompleteCount: productionTrace?.mainTruncatedOrIncompleteCount ?? 0,
    mainNormalizedCandidateCount: productionTrace?.mainNormalizedCandidateCount ?? 0,
    mainCourseFilteredCount: productionTrace?.mainCourseFilteredCount ?? 0,
    mainRoleFilteredCount: productionTrace?.mainRoleFilteredCount ?? 0,
    mainDuplicateCandidateCount: productionTrace?.mainDuplicateCandidateCount ?? 0,
    mainMissingDescriptionCount: productionTrace?.mainMissingDescriptionCount ?? 0,
    mainMissingEvidenceCount: productionTrace?.mainMissingEvidenceCount ?? 0,
    mainInvalidCandidateCount: productionTrace?.mainInvalidCandidateCount ?? 0,
    mainHardRestrictionPrefilteredCount: productionTrace?.mainHardRestrictionPrefilteredCount ?? 0,
    mainPreferenceMatchedCount: productionTrace?.mainPreferenceMatchedCount ?? 0,
    mainPreferenceUnmatchedCount: productionTrace?.mainPreferenceUnmatchedCount ?? 0,
    mainPreferenceMultiMatchedCount: productionTrace?.mainPreferenceMultiMatchedCount ?? 0,
    mainPreferenceEvidenceMissingCount: productionTrace?.mainPreferenceEvidenceMissingCount ?? 0,
    mainCandidateLimit: productionTrace?.mainCandidateLimit ?? 0,
    mainCandidateCountBeforeLimit: productionTrace?.mainCandidateCountBeforeLimit ?? 0,
    mainCandidateLimitDropCount: productionTrace?.mainCandidateLimitDropCount ?? 0,
    mainCandidateCountAfterLimit: productionTrace?.mainCandidateCountAfterLimit ?? 0,
    mainCandidatesSentToSafetyCount: productionTrace?.mainCandidatesSentToSafetyCount ?? 0,
    mainResponseStatusKnown: productionTrace?.mainResponseStatusKnown ?? false,
    mainIncompleteStatusKnown: productionTrace?.mainIncompleteStatusKnown ?? false,
    mainOutputTokenLimitReached: productionTrace?.mainOutputTokenLimitReached ?? false,
    mainRefusalCount: productionTrace?.mainRefusalCount ?? 0,
    mainRawOutputCount: productionTrace?.mainRawOutputCount ?? 0,
    ...(productionTrace?.mainStarterRoleCount !== undefined ? {
      mainStarterRoleCount: productionTrace.mainStarterRoleCount,
      mainSaladRoleCount: productionTrace.mainSaladRoleCount ?? 0,
      mainSideRoleCount: productionTrace.mainSideRoleCount ?? 0,
      mainSoupRoleCount: productionTrace.mainSoupRoleCount ?? 0,
      mainOtherRoleCount: productionTrace.mainOtherRoleCount ?? 0,
      mainStandaloneDishCount: productionTrace.mainStandaloneDishCount ?? 0,
      mainNonStandaloneDishCount: productionTrace.mainNonStandaloneDishCount ?? 0,
      mainMissingRoleClassificationCount: productionTrace.mainMissingRoleClassificationCount ?? 0,
      mainInvalidRoleClassificationCount: productionTrace.mainInvalidRoleClassificationCount ?? 0
    } : {})
  };
}

function buildProductionSafetyTraceFields(productionTrace?: MainDishRecommendationResult["productionTrace"]) {
  return {
    safetyRequestedCandidateCount: productionTrace?.safetyRequestedCandidateCount ?? 0,
    mainCandidateIdCount: productionTrace?.mainCandidateIdCount ?? 0,
    mainUniqueCandidateIdCount: productionTrace?.mainUniqueCandidateIdCount ?? 0,
    safetyReturnedCandidateIdCount: productionTrace?.safetyReturnedCandidateIdCount ?? 0,
    safetyReturnedCheckCount: productionTrace?.safetyReturnedCheckCount ?? 0,
    safetyUniqueReturnedCandidateIdCount: productionTrace?.safetyUniqueReturnedCandidateIdCount ?? 0,
    safetyMissingCandidateCount: productionTrace?.safetyMissingCandidateCount ?? 0,
    safetyDuplicateCandidateIdCount: productionTrace?.safetyDuplicateCandidateIdCount ?? 0,
    safetyUnknownCandidateIdCount: productionTrace?.safetyUnknownCandidateIdCount ?? 0,
    safetyMissingVerdictCount: productionTrace?.safetyMissingVerdictCount ?? 0,
    safetyInvalidVerdictCount: productionTrace?.safetyInvalidVerdictCount ?? 0,
    safetyInvalidSchemaCount: productionTrace?.safetyInvalidSchemaCount ?? 0,
    safetyParseFailureCount: productionTrace?.safetyParseFailureCount ?? 0,
    safetyExceptionCount: productionTrace?.safetyExceptionCount ?? 0,
    safetyTimeoutCount: productionTrace?.safetyTimeoutCount ?? 0,
    safetyEmptyResponseCount: productionTrace?.safetyEmptyResponseCount ?? 0,
    safetyTruncatedOrIncompleteCount: productionTrace?.safetyTruncatedOrIncompleteCount ?? 0
  };
}

function buildProductionPriceResolverTraceFields(diagnostics?: PriceResolverDiagnostics) {
  return {
    priceResolverEvaluatedCount: diagnostics?.priceResolverEvaluatedCount ?? 0,
    priceResolverSkippedCount: diagnostics?.priceResolverSkippedCount ?? 0,
    priceResolverMxnCount: diagnostics?.priceResolverMxnCount ?? 0,
    priceResolverUsdCount: diagnostics?.priceResolverUsdCount ?? 0,
    priceResolverUnknownCount: diagnostics?.priceResolverUnknownCount ?? 0,
    priceResolverExplicitCount: diagnostics?.priceResolverExplicitCount ?? 0,
    priceResolverContextCount: diagnostics?.priceResolverContextCount ?? 0,
    priceResolverApproxGeneratedCount: diagnostics?.priceResolverApproxGeneratedCount ?? 0,
    priceResolverApproxMissingCount: diagnostics?.priceResolverApproxMissingCount ?? 0,
    priceResolverMexicoMarkerCount: diagnostics?.priceResolverMexicoMarkerCount ?? 0,
    priceResolverMexicanPesoMarkerCount: diagnostics?.priceResolverMexicanPesoMarkerCount ?? 0,
    priceResolverMxDomainMarkerCount: diagnostics?.priceResolverMxDomainMarkerCount ?? 0
  };
}

function buildProductionSourceHash(source: TwoStepMenuSourceInput) {
  const payload = JSON.stringify({
    kind: source.kind,
    mainAiInputMode: source.mainAiInputMode ?? "",
    text: source.text ?? "",
    sourceUrl: source.sourceUrl ?? "",
    urls: source.urls ?? []
  });

  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function countHardRestrictions(profile: AnalyzeMenuRequest["profile"]) {
  return stringArrayValue(profile.allergens).length + stringArrayValue(profile.customExclusions).length;
}

function hasLactoseCanonicalRule(profile: AnalyzeMenuRequest["profile"]) {
  return stringArrayValue(profile.allergens).some((value) => {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return normalized === "lactose" || normalized === "laktose";
  });
}

function markProductionRequestTraceLogged(error: unknown) {
  if (typeof error === "object" && error !== null) {
    Object.defineProperty(error, PRODUCTION_REQUEST_TRACE_LOGGED, {
      configurable: true,
      value: true
    });
  }
}

function isProductionRequestTraceLogged(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[PRODUCTION_REQUEST_TRACE_LOGGED] === true;
}

function mapUncertainReviewCandidatesToAnalyzeData(
  candidates: MainDishRecommendationResult["uncertainReviewCandidates"],
  requestedDishRoles: RequestedDishRole[],
  outputLocale: string
): TwoStepAnalyzeDataParts {
  const roleMetadata = buildUncertainReviewRoleMetadata(requestedDishRoles);
  const reason = buildUncertainReviewReason(outputLocale);
  const validCandidates = candidates
    .map((candidate) => candidate.recommendationPayload)
    .filter((payload): payload is NonNullable<typeof payload> => Boolean(payload))
    .filter((payload) =>
      Boolean(
        payload.nameOriginal?.trim() &&
        payload.translatedName?.trim() &&
        payload.confidence &&
        payload.profileSafety &&
        payload.profileSafety.hasKnownConflict === false &&
        payload.profileSafety.uncertainForAllergy === false
      )
    )
    .slice(0, 3);

  const dishes: Dish[] = validCandidates.map((item, index) => {
    const evidence = normalizeOptionalResponseText(item.sourceEvidence);
    const descriptionOriginal = normalizeOptionalResponseText(item.descriptionOriginal);
    const translatedDescription = normalizeOptionalResponseText(item.translatedDescription);

    return {
      id: `uncertain_review_${String(index + 1).padStart(3, "0")}`,
      nameOriginal: item.nameOriginal!.trim(),
      ...(translatedDescription ? { description: translatedDescription } : {}),
      ...(descriptionOriginal ? { descriptionOriginal } : {}),
      price: parseReviewPrice(item.priceRaw),
      category: roleMetadata.category,
      itemType: "dish",
      sourceFormat: "ai",
      sourceCategoryOriginal: normalizeOptionalResponseText(item.sourceCategoryOriginal),
      sourceUrl: normalizeOptionalResponseText(item.sourceUrl),
      dishRole: roleMetadata.dishRole,
      dishRoles: [...roleMetadata.dishRoles],
      primaryRole: roleMetadata.primaryRole,
      roleConfidence: 0.4,
      roleEvidence: evidence,
      isMainCourseCandidate: roleMetadata.primaryRole === "main",
      isSafeRecommendationCandidate: false,
      sourceLine: [item.nameOriginal, descriptionOriginal, evidence]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" ")
    };
  });

  const recommendations: Recommendation[] = validCandidates.map((item, index) => ({
    dishId: dishes[index]!.id,
    rank: index + 1,
    reason,
    facts: normalizeOptionalResponseText(item.sourceEvidence),
    translatedName: item.translatedName!.trim(),
    ...(normalizeOptionalResponseText(item.translatedDescription) ? { translatedDescription: normalizeOptionalResponseText(item.translatedDescription) } : {}),
    ...(normalizeOptionalResponseText(item.descriptionOriginal) ? { descriptionOriginal: normalizeOptionalResponseText(item.descriptionOriginal) } : {})
  }));

  return {
    dishes,
    recommendations
  };
}

function buildUncertainReviewRoleMetadata(values: RequestedDishRole[]) {
  const includesStarterOrSalad = values.includes("starter") || values.includes("salad");

  if (includesStarterOrSalad) {
    return {
      category: "AI-Pruefkandidat Vorspeise/Salat",
      dishRole: "starter" as const,
      dishRoles: ["starter", "salad"] as const,
      primaryRole: "starter" as const
    };
  }

  return {
    category: "AI-Pruefkandidat",
    dishRole: "main" as const,
    dishRoles: ["main"] as const,
    primaryRole: "main" as const
  };
}

function buildUncertainReviewReason(outputLocale: string) {
  return normalizeTargetLocale(outputLocale).startsWith("en")
    ? "Selected for review because the menu information is incomplete."
    : "Aufgrund unvollstaendiger Angaben nur zur Pruefung ausgewaehlt.";
}

function isUncertainReviewFeatureEnabled() {
  return process.env.GUSTARO_UNCERTAIN_REVIEW_CANDIDATES === "true";
}

function normalizeOptionalResponseText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseReviewPrice(value: string | null | undefined) {
  const normalized = normalizeOptionalResponseText(value);
  if (!normalized) return undefined;

  const match = normalized.replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;

  const price = Number(match[1]);
  return Number.isFinite(price) ? price : undefined;
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

  const sourceWithPdfExtracts = source as TwoStepMenuSourceInput & {
    pdfExtractedTexts?: MenuSourceExtractedText[];
  };
  const reusablePdfTexts = new Map(
    (sourceWithPdfExtracts.pdfExtractedTexts ?? [])
      .map((entry) => [entry.url.trim().toLowerCase(), entry.text.trim()] as const)
      .filter((entry) => entry[1].length > 0)
  );
  const extractedTexts: string[] = [];

  for (const pdfUrl of pdfUrls) {
    const reusablePdfText = reusablePdfTexts.get(pdfUrl.trim().toLowerCase());
    if (reusablePdfText) {
      extractedTexts.push(reusablePdfText);
      continue;
    }

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
    pdfTextQualityUsable: source.pdfTextQuality?.usableForAnalysis ?? false,
    pdfTextSourceUrls: pdfUrls.join(","),
    durationMs: Date.now() - startedAt
  });

  const extractedText = supplementalText.trim();
  const fallbackReason = getPdfFileFallbackReason({
    source,
    extractedText
  });

  if (extractedText && !fallbackReason) {
    return {
      ...source,
      text: extractedText,
      mainAiInputMode: "extracted_text" as const,
      extractedTextCharCount: extractedText.length,
      pdfFallbackReason: undefined
    };
  }

  const existingText = source.text?.trim();
  const text = [
    existingText,
    "Serverseitig extrahierter PDF-Text (best effort, nur als zusätzlicher Menü-Kontext für die AI):",
    supplementalText
  ].filter(Boolean).join("\n\n");

  return {
    ...source,
    text,
    mainAiInputMode: "pdf_file_fallback" as const,
    extractedTextCharCount: extractedText.length,
    pdfFallbackReason: fallbackReason ?? "pdf_text_not_extracted"
  };
}

function getPdfFileFallbackReason({
  source,
  extractedText
}: {
  source: TwoStepMenuSourceInput;
  extractedText: string;
}) {
  if (!extractedText) {
    return "pdf_text_not_extracted";
  }

  if (!source.pdfTextQuality) {
    return "pdf_text_quality_missing";
  }

  if (!source.pdfTextQuality.usableForAnalysis) {
    return "pdf_text_quality_not_sufficient";
  }

  return null;
}

function logTwoStepMain(fields: Record<string, TwoStepMainLogValue>) {
  if (!isAnalyzeDiagnosticsEnabled()) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatTwoStepMainLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_2STEP_MAIN] ${payload}`);
}

function logAnalyzePerf(fields: Record<string, TwoStepMainLogValue>) {
  if (!isAnalyzeDiagnosticsEnabled()) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatTwoStepMainLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_ANALYZE_PERF] ${payload}`);
}

function logDevAnalyzeTiming(fields: Record<string, TwoStepMainLogValue>) {
  if (!isAnalyzeDiagnosticsEnabled()) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatTwoStepMainLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_DEV_ANALYZE_TIMING] ${payload}`);
}

// Diagnose fuer die HTML-Menue-Extraktion: zeigt, ob strukturierte Items
// gefunden wurden oder ob auf den schwaecheren Fragments-Fallback
// zurueckgefallen wurde (Fallanalyse "60secondstonapoli.de", Juli 2026).
// Ohne dieses Log war bei einem gemeldeten Extraktionsproblem nicht
// nachvollziehbar, ob die Ursache eine leere Items-Liste oder etwas anderes
// (z.B. Kategorisierung) war.
function logDevHtmlMenuExtraction(fields: Record<string, TwoStepMainLogValue>) {
  if (!isAnalyzeDiagnosticsEnabled()) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatTwoStepMainLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_DEV_HTML_MENU_EXTRACTION] ${payload}`);
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

function enrichMappedHtmlDescriptions(
  mapped: { dishes: Dish[]; recommendations: Recommendation[] },
  htmlMenuExtraction: MenuExtractionResult | null,
  outputLocale: string
) {
  if (!htmlMenuExtraction?.items.length) {
    return mapped;
  }

  const htmlDishesByName = new Map(
    htmlMenuExtractionToDishes(htmlMenuExtraction)
      .filter((dish) => Boolean(dish.descriptionOriginal?.trim()))
      .map((dish) => [normalizeHtmlBackfillDisplayName(dish.nameOriginal), dish])
  );

  if (htmlDishesByName.size === 0) {
    return mapped;
  }

  const translatedDescriptionByDishId = new Map<string, string>();
  const nextDishes = mapped.dishes.map((dish) => {
    if (dish.descriptionOriginal?.trim()) {
      return dish;
    }

    const htmlDish = htmlDishesByName.get(normalizeHtmlBackfillDisplayName(dish.nameOriginal));
    const descriptionOriginal = htmlDish?.descriptionOriginal?.trim();

    if (!descriptionOriginal) {
      return dish;
    }

    const translatedDescription = getTrustedSameLanguageDescription(descriptionOriginal, outputLocale);

    if (translatedDescription) {
      translatedDescriptionByDishId.set(dish.id, translatedDescription);
    }

    return {
      ...dish,
      ...(translatedDescription ? { description: translatedDescription } : {}),
      descriptionOriginal,
      sourceLine: buildHtmlEnrichedSourceLine({
        nameOriginal: dish.nameOriginal,
        descriptionOriginal,
        sourceLine: dish.sourceLine
      })
    };
  });

  if (nextDishes === mapped.dishes) {
    return mapped;
  }

  const descriptionByDishId = new Map(
    nextDishes
      .filter((dish) => Boolean(dish.descriptionOriginal?.trim()))
      .map((dish) => [dish.id, dish.descriptionOriginal!.trim()])
  );

  const nextRecommendations = mapped.recommendations.map((recommendation) => {
    if (recommendation.descriptionOriginal?.trim()) {
      return recommendation;
    }

    const descriptionOriginal = descriptionByDishId.get(recommendation.dishId);

    if (!descriptionOriginal) {
      return recommendation;
    }

    const translatedDescription = translatedDescriptionByDishId.get(recommendation.dishId);

    return {
      ...recommendation,
      descriptionOriginal,
      ...(translatedDescription ? { translatedDescription } : {})
    };
  });

  return {
    dishes: nextDishes,
    recommendations: nextRecommendations
  };
}

function getTrustedSameLanguageDescription(descriptionOriginal: string, outputLocale: string) {
  const targetLanguageCode = normalizeTargetLocale(outputLocale).toLowerCase().split(/[-_]/)[0];

  if (targetLanguageCode === "de" && looksLikeGermanText(descriptionOriginal)) {
    return descriptionOriginal;
  }

  if (targetLanguageCode === "en" && looksLikeEnglishText(descriptionOriginal)) {
    return descriptionOriginal;
  }

  return undefined;
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

function buildHtmlEnrichedSourceLine({
  nameOriginal,
  descriptionOriginal,
  sourceLine
}: {
  nameOriginal: string;
  descriptionOriginal: string;
  sourceLine: string;
}) {
  const existing = sourceLine.trim();

  if (existing && normalizeDisplayName(existing).includes(normalizeDisplayName(descriptionOriginal))) {
    return existing;
  }

  return [nameOriginal, descriptionOriginal, existing]
    .filter((value) => value.trim())
    .join(" - ");
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

function normalizeHtmlBackfillDisplayName(value: string) {
  return normalizeDisplayName(value.replace(/^\s*\d{1,4}\s*(?:[.)]|[-:\u2022])\s*/, ""));
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

function mapAttributionEvidenceError(_error: unknown) {
  return null;
}

function formatRequestedDishRolesForOps(roles: RequestedDishRole[]) {
  return roles.length ? roles.join(",") : "main";
}

function getAnalyzeRequestKind(
  roles: RequestedDishRole[],
  preferredDishRole: PreferredDishRole | undefined
) {
  return preferredDishRole === "starter" && roles.includes("starter") ? "embedded" : "topLevel";
}

function mapStarterSaladInvalidMainAiSchemaError(error: unknown, roles: RequestedDishRole[]) {
  if (!isStarterSaladRoleClassificationRequest(roles)) {
    return error;
  }

  if (!(error instanceof SyntaxError) || error.message !== "AI_RESPONSE_INVALID_SCHEMA") {
    return error;
  }

  const controlledError = new AppError(
    422,
    "NO_SAFE_RECOMMENDATIONS",
    "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten."
  );
  attachAnalyzeOpsDiagnosticReason(controlledError, "main_ai_invalid_starter_salad_schema");
  return controlledError;
}

function isStarterSaladRoleClassificationRequest(roles: RequestedDishRole[]) {
  return roles.includes("starter") || roles.includes("salad");
}

function attachAnalyzeOpsDiagnosticReason(error: AppError, reason: string | undefined) {
  if (!reason) {
    return;
  }

  Object.defineProperty(error, "__opsDiagnosticReason", {
    value: reason,
    enumerable: false
  });
}

function getAnalyzeOpsDiagnosticReason(error: unknown) {
  if (typeof error === "object" && error !== null && "__opsDiagnosticReason" in error) {
    const reason = (error as { __opsDiagnosticReason?: unknown }).__opsDiagnosticReason;
    return typeof reason === "string" ? reason : undefined;
  }

  const message = getErrorMessage(error);

  if (message.includes("ATTRIBUTION_NOT_CONFIRMED")) return getAttributionOpsDiagnosticReason(message);
  if (message.includes("ATTRIBUTION_EVIDENCE_TIMEOUT")) return "attribution_evidence_timeout";
  if (message.includes("ATTRIBUTION_EVIDENCE_TECHNICAL_ERROR")) return "attribution_evidence_technical_error";
  if (message.includes("TWO_STEP_MAIN_AI_TIMEOUT")) return "main_ai_timeout";
  if (message.includes("TEXT_AI_TIMEOUT")) return "main_ai_timeout";
  if (message.includes("PDF_AI_TIMEOUT")) return "main_ai_timeout";
  if (message.includes("IMAGE_AI_TIMEOUT")) return "main_ai_timeout";

  if (error instanceof AppError && error.status === 422) {
    if (error.code === "NO_SAFE_RECOMMENDATIONS") return "main_ai_no_safe_candidates";
    if (error.code === "ANALYSIS_NOT_SAFE") return "analysis_not_safe";
    return "safety_or_analysis";
  }

  return undefined;
}

function getAttributionOpsDiagnosticReason(message: string) {
  const reason = message.includes("ATTRIBUTION_NOT_CONFIRMED:")
    ? message.split("ATTRIBUTION_NOT_CONFIRMED:")[1]?.trim()
    : "";

  return isAttributionOpsDiagnosticReason(reason) ? reason : "no_valid_attribution_after_backfill";
}

function isAttributionOpsDiagnosticReason(value: string | undefined) {
  return value === "no_active_profile_match" ||
    value === "no_evidence_checks" ||
    value === "evidence_invalid" ||
    value === "evidence_uncertain" ||
    value === "no_valid_attribution_after_backfill";
}

function getAnalyzeOpsErrorClass(error: unknown) {
  const message = getErrorMessage(error);

  if (/timeout/i.test(message)) return "timeout";
  if (/abort/i.test(message) || error instanceof DOMException && error.name === "AbortError") return "abort";
  if (/fetch failed|connection|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(message)) return "connection";
  if (/AI_RESPONSE_INVALID|SyntaxError|JSON/i.test(message) || error instanceof SyntaxError) return "invalid-response";
  return undefined;
}

function validateAnalyzeImageBase64(value: unknown) {
  if (typeof value !== "string") {
    throw new AppError(400, "IMAGE_INVALID_REQUEST", "Das Speisekartenfoto konnte nicht verarbeitet werden.");
  }

  const trimmed = value.trim();

  if (trimmed.length < 100 || trimmed.length > MAX_ANALYZE_IMAGE_BASE64_LENGTH) {
    throw new AppError(400, "IMAGE_INVALID_REQUEST", "Das Speisekartenfoto konnte nicht verarbeitet werden.");
  }

  return trimmed;
}

function validateAnalyzeImageMimeType(value: unknown): "image/jpeg" | "image/png" {
  if (value === "image/png") {
    return "image/png";
  }

  if (value === "image/jpeg" || value === "image/jpg" || value === undefined || value === null || value === "") {
    return "image/jpeg";
  }

  throw new AppError(400, "IMAGE_INVALID_REQUEST", "Das Speisekartenfoto konnte nicht verarbeitet werden.");
}
function isTemporaryConnectionError(error: unknown) {
  const technicalSignal = [
    error instanceof Error ? error.name : "",
    getErrorMessage(error),
    typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "",
    typeof error === "object" && error !== null && "type" in error ? String((error as { type?: unknown }).type ?? "") : "",
    typeof error === "object" && error !== null && "cause" in error
      ? getErrorMessage((error as { cause?: unknown }).cause)
      : "",
    typeof error === "object" && error !== null && "cause" in error
      ? String(((error as { cause?: { code?: unknown } }).cause)?.code ?? "")
      : ""
  ].join(" ");

  return /ENOTFOUND|EAI_AGAIN|fetch failed|Connection_error|connection error|APIConnectionError/i.test(technicalSignal);
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
  const selectedBaseScore = selectedSource?.baseScore ?? 0;

  if (selected && isAnalyzeDiagnosticsEnabled()) {
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
        restaurantContextText: selectedSource?.restaurantContextText,
        pdfExtractedTexts: selected.extractedTexts,
        pdfTextQuality: {
          ...selected.metrics,
          baseScore: selectedBaseScore,
          usableForAnalysis: isExistingPdfTextQualityUsableForAnalysis(selected.metrics, selectedBaseScore)
        }
      }
    : null;
}

function isExistingPdfTextQualityUsableForAnalysis(metrics: MenuSourceQualityMetrics, baseScore: number) {
  return metrics.textLength > 0 && metrics.score > baseScore;
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

  if (selected && isAnalyzeDiagnosticsEnabled()) {
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

function countMenuPriceSignals(value: string) {
  return (value.match(/(?:\u20ac|eur|euro)\s*\d+|\d+\s*(?:\u20ac|eur|euro)|\d+[,.]\d{2}/gi) ?? []).length;
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

function normalizePreferredDishRole(value: unknown): PreferredDishRole | undefined {
  return value === "starter" || value === "salad" ? value : undefined;
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
