import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/requireUser";
import { recommendStarterForMainDishAI } from "../../../src/ai/recommendStarterForMainDishAI";
import {
  addStarterPairingsFromCandidatesAI,
  addStarterPairingsFromImageUrlsAI,
  addStarterPairingsFromMenuTextAI,
  addStarterPairingsFromPdfUrlAI,
  type StarterPairingCandidate
} from "../../../src/ai/recommendStarterPairingsAI";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { gatekeepStarterRecommendation } from "../../../src/recommendation/gatekeeper";
import { mapGatekeptStarterRecommendationToRecommendation } from "../../../src/recommendation/twoStepRecommendationMappers";
import { sanitizeProfileForRecommendation } from "../../../src/profile/profileInputPolicy";
import {
  extractHtmlMenuFromUrl,
  htmlMenuExtractionToDishes,
  htmlMenuExtractionToMenuText
} from "../../../src/menu/extraction/extractHtmlMenu";
import { getDishRoleTags, getPrimaryDishRoleTag } from "../../../src/menu/dishRoleTags";
import { findLinkedMenuImageUrls, looksLikeImageUrl } from "../../../src/menu/findLinkedMenuImageUrls";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import type { AnalyzeMenuRequest } from "../../../src/types/api";
import type { Dish, DishRoleTag } from "../../../src/types/menu";
import type { Recommendation } from "../../../src/types/recommendations";
import type { TwoStepMenuSourceInput } from "../../../src/ai/twoStepRecommendationSchemas";

type StarterPairingsRequest = AnalyzeMenuRequest & {
  dishes: Dish[];
  starterCandidateDishes?: Dish[];
  recommendations: Recommendation[];
  targetDishId?: string;
};

export async function POST(request: Request) {
  let targetRecommendationsForRetry: Recommendation[] = [];

  try {
    await requireUser(request);

    const body = (await request.json()) as StarterPairingsRequest;
    const outputLocale = normalizeTargetLocale(body.profile.outputLocale);
    const profile = sanitizeProfileForRecommendation({
      ...body.profile,
      outputLocale
    });

    if (body.sourceKind !== "text") {
      throw new AppError(400, "SOURCE_KIND_UNSUPPORTED", "Diese Art von Speisekarte wird in V1 noch nicht unterstützt.");
    }

    const targetRecommendations = selectTargetRecommendations(body.recommendations, body.targetDishId);
    targetRecommendationsForRetry = targetRecommendations;

    if (body.situation !== "richtig_hunger" || targetRecommendations.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          recommendations: targetRecommendations
        }
      });
    }

    if (!body.menuText || body.menuText.trim().length < 20) {
      throw new AppError(400, "MENU_TOO_SHORT", "Bitte zuerst eine Speisekarte einfügen.");
    }

    const menuText = body.menuText.trim();
    const recommendations = await withTimeout(
      addGatekeptStarterPairingsForSource({
        menuText,
        dishes: body.dishes,
        recommendations: targetRecommendations,
        situation: body.situation,
        profile,
        userLocale: outputLocale
      }),
      getStarterPairingTimeoutMs(menuText, body.dishes),
      "STARTER_PAIRING_TIMEOUT"
    );

    return NextResponse.json({
      ok: true,
      data: {
        recommendations
      }
    });
  } catch (error) {
    if (targetRecommendationsForRetry.length > 0 && isTemporaryStarterAiError(error)) {
      return starterRetryableErrorResponse(targetRecommendationsForRetry);
    }

    return errorResponse(error);
  }
}

function starterRetryableErrorResponse(recommendations: Recommendation[]) {
  return NextResponse.json({
    ok: true,
    data: {
      recommendations,
      starterRetryableError: true,
      starterErrorCode: "TEMPORARY_AI_ERROR"
    }
  });
}

async function addGatekeptStarterPairingsForSource({
  menuText,
  dishes,
  recommendations,
  situation,
  profile,
  userLocale
}: {
  menuText: string;
  dishes: Dish[];
  recommendations: Recommendation[];
  situation: AnalyzeMenuRequest["situation"];
  profile: AnalyzeMenuRequest["profile"];
  userLocale: string;
}) {
  const source = await buildStarterSourceInput(menuText);
  const sourceKind = source.kind;
  const sourceCount = getStarterSourceCount(source);
  let result = recommendations;

  for (const recommendation of recommendations) {
    const mainDish = buildStarterMainDishAnchor(dishes, recommendation);
    const hasTargetMainDish = Boolean(mainDish);

    if (!mainDish) {
      logGatekeeperStarter({
        phase: "starter-ai",
        sourceKind,
        sourceCount,
        hasTargetMainDish,
        starterAiReturned: false,
        starterAiTranslatedNamePresent: false,
        durationMs: 0
      });
      continue;
    }

    const starterAiStartedAt = Date.now();
    let starterRecommendation: Awaited<ReturnType<typeof recommendStarterForMainDishAI>>;

    try {
      starterRecommendation = await recommendStarterForMainDishAI({
        source,
        profile,
        situation,
        mainDish,
        userLocale
      });
      logGatekeeperStarter({
        phase: "starter-ai",
        sourceKind,
        sourceCount,
        hasTargetMainDish,
        starterAiReturned: Boolean(starterRecommendation),
        starterAiTranslatedNamePresent: hasStarterTranslatedName(starterRecommendation),
        durationMs: Date.now() - starterAiStartedAt
      });
    } catch (error) {
      logGatekeeperStarterError({
        phase: isTemporaryStarterAiError(error) ? "temporary-error" : "starter-ai-error",
        sourceKind,
        sourceCount,
        hasTargetMainDish,
        durationMs: Date.now() - starterAiStartedAt,
        retryable: isTemporaryStarterAiError(error),
        error
      });
      throw error;
    }

    const gatekeeperStartedAt = Date.now();
    const gatekeeperResult = gatekeepStarterRecommendation(starterRecommendation);
    logGatekeeperStarter({
      phase: "gatekeeper",
      sourceKind,
      sourceCount,
      hasTargetMainDish,
      gatekeeperAccepted: Boolean(gatekeeperResult.accepted),
      gatekeeperRejected: Boolean(gatekeeperResult.rejected),
      durationMs: Date.now() - gatekeeperStartedAt
    });

    const mapperStartedAt = Date.now();
    const mappedRecommendation = gatekeeperResult.accepted
      ? mapGatekeptStarterRecommendationToRecommendation({
          recommendation,
          starter: gatekeeperResult.accepted
        })
      : recommendation;
    logGatekeeperStarter({
      phase: "mapper",
      sourceKind,
      sourceCount,
      hasTargetMainDish,
      mapperStarterPresent: Boolean(mappedRecommendation.starter),
      mapperTranslatedNamePresent: Boolean(mappedRecommendation.starter?.translatedName?.trim()),
      durationMs: Date.now() - mapperStartedAt
    });

    result = result.map((item) => item.dishId === recommendation.dishId ? mappedRecommendation : item);
  }

  return result;
}

async function addStarterPairingsForSource({
  menuText,
  dishes,
  starterCandidateDishes,
  recommendations,
  allRecommendations,
  profile,
  userLocale
}: {
  menuText: string;
  dishes: Dish[];
  starterCandidateDishes: Dish[];
  recommendations: Recommendation[];
  allRecommendations: Recommendation[];
  profile: AnalyzeMenuRequest["profile"];
  userLocale: string;
}) {
  const structuredCandidates = buildStructuredStarterCandidates(starterCandidateDishes, dishes);

  if (structuredCandidates.length > 0) {
    return addStarterPairingsFromCandidatesAI({
      dishes,
      recommendations,
      allRecommendations,
      candidates: structuredCandidates,
      profile,
      userLocale
    });
  }

  const inputLooksLikeUrl = looksLikeUrl(menuText);

  if (inputLooksLikeUrl && looksLikePdfUrl(menuText)) {
    return addStarterPairingsFromPdfUrlAI({
      pdfUrl: menuText,
      dishes,
      recommendations,
      allRecommendations,
      profile,
      userLocale
    });
  }

  if (inputLooksLikeUrl && looksLikeImageUrl(menuText)) {
    return addStarterPairingsFromImageUrlsAI({
      imageUrls: [menuText],
      dishes,
      recommendations,
      allRecommendations,
      profile,
      userLocale
    });
  }

  if (inputLooksLikeUrl) {
    try {
      const htmlMenuExtraction = await extractHtmlMenuFromUrl(menuText);

      if (htmlMenuExtraction?.items.length) {
        const htmlDishes = htmlMenuExtractionToDishes(htmlMenuExtraction);
        const htmlCandidates = buildStarterCandidatesFromDishes(htmlDishes);

        if (htmlCandidates.length > 0) {
          return addStarterPairingsFromCandidatesAI({
            dishes,
            recommendations,
            allRecommendations,
            candidates: htmlCandidates,
            profile,
            userLocale
          });
        }

        return addStarterPairingsFromMenuTextAI({
          menuText: htmlMenuExtractionToMenuText(htmlMenuExtraction),
          dishes,
          recommendations,
          allRecommendations,
          profile,
          userLocale
        });
      }
    } catch {
      // Try linked images or plain loaded text below.
    }

    const linkedImageUrls = await findLinkedMenuImageUrls(menuText);

    if (linkedImageUrls.length > 0) {
      return addStarterPairingsFromImageUrlsAI({
        imageUrls: linkedImageUrls,
        dishes,
        recommendations,
        allRecommendations,
        profile,
        userLocale
      });
    }

    return addStarterPairingsFromMenuTextAI({
      menuText: await loadMenuTextFromUrl(menuText),
      dishes,
      recommendations,
      allRecommendations,
      profile,
      userLocale
    });
  }

  return addStarterPairingsFromMenuTextAI({
    menuText,
    dishes,
    recommendations,
    allRecommendations,
    profile,
    userLocale
  });
}

async function buildStarterSourceInput(menuText: string): Promise<TwoStepMenuSourceInput> {
  if (!looksLikeUrl(menuText)) {
    return {
      kind: "text",
      text: menuText
    };
  }

  if (looksLikePdfUrl(menuText)) {
    return {
      kind: "pdf",
      urls: [menuText],
      sourceUrl: menuText,
      text: menuText
    };
  }

  if (looksLikeImageUrl(menuText)) {
    return {
      kind: "image",
      urls: [menuText],
      sourceUrl: menuText,
      text: menuText
    };
  }

  try {
    const sourceText = await loadMenuTextFromUrl(menuText);

    if (sourceText.trim().length >= 20) {
      return {
        kind: "html",
        text: sourceText,
        sourceUrl: menuText
      };
    }
  } catch {
    // Use the original URL as sparse context. The AI must return null if it cannot verify a starter.
  }

  return {
    kind: "text",
    text: menuText,
    sourceUrl: menuText
  };
}

function buildStarterMainDishAnchor(dishes: Dish[], recommendation: Recommendation) {
  const dish = dishes.find((item) => item.id === recommendation.dishId);

  if (!dish) {
    return null;
  }

  return {
    rank: recommendation.rank,
    nameOriginal: dish.nameOriginal,
    translatedName: recommendation.translatedName,
    priceRaw: typeof dish.price === "number" ? `${dish.price.toFixed(2).replace(".", ",")} â‚¬` : null,
    sourceEvidence: recommendation.facts ?? dish.sourceLine,
    sourceUrl: dish.sourceUrl ?? null,
    sourceCategoryOriginal: dish.sourceCategoryOriginal ?? dish.category ?? null,
    reason: recommendation.reason
  };
}

function buildStarterCandidatesFromDishes(dishes: Dish[]): StarterPairingCandidate[] {
  return dishes
    .filter(isStarterPairingCandidate)
    .map((dish) => ({
      id: dish.id,
      nameOriginal: dish.nameOriginal,
      descriptionOriginal: dish.descriptionOriginal,
      priceRaw: typeof dish.price === "number" ? `${dish.price.toFixed(2).replace(".", ",")} €` : undefined,
      category: dish.category,
      sourceLine: dish.sourceLine,
      evidence: dish.sourceLine
    }))
    .slice(0, 80);
}

function buildStructuredStarterCandidates(starterCandidateDishes: Dish[], dishes: Dish[]) {
  return dedupeStarterPairingCandidates([
    ...buildStarterCandidatesFromDishes(starterCandidateDishes),
    ...buildStarterCandidatesFromDishes(dishes)
  ]).slice(0, 80);
}

function dedupeStarterPairingCandidates(candidates: StarterPairingCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = normalizeStarterCandidateName(candidate.nameOriginal);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function isStarterPairingCandidate(dish: Dish): boolean {
  const roleTags = getDishRoleTags(dish);
  const primaryRole = getPrimaryDishRoleTag(dish);
  const explicitV2Roles = getExplicitV2RoleTags(dish);
  const hasExplicitV2Roles = explicitV2Roles.length > 0;

  if (
    primaryRole === "starter" ||
    primaryRole === "soup" ||
    roleTags.includes("starter") ||
    roleTags.includes("soup")
  ) {
    return !hasReliableV2NonStarterConflict(dish, explicitV2Roles);
  }

  if (explicitV2Roles.includes("salad")) {
    return dish.isStarterCandidate === true && !hasV2NonStarterRole(explicitV2Roles);
  }

  if (dish.dishRole !== "starter") {
    return false;
  }

  if (!hasExplicitV2Roles || explicitV2Roles.every((role) => role === "unknown")) {
    return true;
  }

  return !hasReliableV2NonStarterConflict(dish, explicitV2Roles);
}

function getExplicitV2RoleTags(dish: Dish): DishRoleTag[] {
  const roles: DishRoleTag[] = [];

  for (const role of dish.dishRoles ?? []) {
    if (!roles.includes(role)) {
      roles.push(role);
    }
  }

  if (dish.primaryRole && !roles.includes(dish.primaryRole)) {
    roles.push(dish.primaryRole);
  }

  return roles;
}

function hasReliableV2NonStarterConflict(dish: Dish, roles: DishRoleTag[]): boolean {
  if (!hasV2NonStarterRole(roles)) {
    return false;
  }

  return isHighConfidenceRole(dish) || hasCategoryRoleEvidence(dish);
}

function hasV2NonStarterRole(roles: DishRoleTag[]): boolean {
  return roles.some((role) => NON_STARTER_PAIRING_ROLE_TAGS.has(role));
}

function isHighConfidenceRole(dish: Dish): boolean {
  return typeof dish.roleConfidence === "number" && dish.roleConfidence >= 0.8;
}

function hasCategoryRoleEvidence(dish: Dish): boolean {
  return Boolean(
    dish.sourceCategoryOriginal?.trim() ||
    dish.sourceCategoryNormalized?.trim() ||
    dish.roleEvidence?.trim().toLowerCase().startsWith("category:")
  );
}

const NON_STARTER_PAIRING_ROLE_TAGS = new Set<DishRoleTag>([
  "main",
  "side",
  "dessert",
  "drink",
  "breakfast",
  "brunch",
  "kids",
  "menuSet"
]);

function selectTargetRecommendations(recommendations: Recommendation[], targetDishId: string | undefined) {
  const target = targetDishId?.trim();

  if (!target) {
    return recommendations;
  }

  return recommendations.filter((recommendation) => recommendation.dishId === target);
}

function getStarterPairingTimeoutMs(menuText: string, dishes: Dish[]): number {
  if (buildStarterCandidatesFromDishes(dishes).length > 0) {
    return 25000;
  }

  if (looksLikeUrl(menuText)) {
    return 45000;
  }

  return 30000;
}

type StarterLogValue = string | number | boolean | null | undefined;

function logGatekeeperStarter(fields: Record<string, StarterLogValue>) {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${formatStarterLogValue(value)}`)
    .join(" ");

  console.info(`[GUSTARO_GATEKEEPER_STARTER] ${payload}`);
}

function logGatekeeperStarterError({
  phase,
  sourceKind,
  sourceCount,
  hasTargetMainDish,
  durationMs,
  retryable,
  error
}: {
  phase: string;
  sourceKind: string;
  sourceCount: number;
  hasTargetMainDish: boolean;
  durationMs: number;
  retryable?: boolean;
  error: unknown;
}) {
  logGatekeeperStarter({
    phase,
    sourceKind,
    sourceCount,
    hasTargetMainDish,
    retryable,
    durationMs,
    errorName: error instanceof Error ? error.name : typeof error,
    errorCode: getErrorCode(error),
    errorMessage: getShortLogMessage(getErrorMessage(error)),
    statusCode: getErrorStatusCode(error)
  });
}

function getStarterSourceCount(source: TwoStepMenuSourceInput) {
  const urlCount = source.urls?.filter((url) => url.trim().length > 0).length ?? 0;
  if (urlCount > 0) return urlCount;
  if (source.sourceUrl) return 1;
  return source.text?.trim() ? 1 : 0;
}

function hasStarterTranslatedName(value: unknown) {
  return typeof value === "object" &&
    value !== null &&
    "translatedName" in value &&
    typeof value.translatedName === "string" &&
    value.translatedName.trim().length > 0;
}

function formatStarterLogValue(value: StarterLogValue) {
  if (typeof value === "string") {
    return value.replace(/\s+/g, "_").slice(0, 160);
  }

  return String(value);
}

function getShortLogMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatusCode(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status as StarterLogValue
    : undefined;
}

function getErrorStatusCodeNumber(error: unknown) {
  const status = getErrorStatusCode(error);

  return typeof status === "number" ? status : undefined;
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code as StarterLogValue
    : undefined;
}

function looksLikePdfUrl(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function normalizeTargetLocale(value: string | undefined) {
  const locale = value?.trim();

  return locale ? locale.slice(0, 40) : "de-DE";
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
    message.includes("TPM") ||
    message.includes("RECOMMENDATION_TRANSLATION_RATE_LIMIT");
}

function isTemporaryStarterAiError(error: unknown) {
  if (isRateLimitError(error)) {
    return true;
  }

  if (error instanceof Error && error.message.includes("STARTER_PAIRING_TIMEOUT")) {
    return true;
  }

  const status = getErrorStatusCodeNumber(error);
  if (status === 408 || status === 425 || status === 429 || (typeof status === "number" && status >= 500)) {
    return true;
  }

  const code = String(getErrorCode(error) ?? "");
  const message = getErrorMessage(error);
  const technicalSignal = `${code} ${message}`;

  return /timeout|timed out|fetch failed|network|connection error|temporarily unavailable|service unavailable|provider unavailable|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(technicalSignal);
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
