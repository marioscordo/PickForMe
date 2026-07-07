import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/requireUser";
import {
  addStarterPairingsFromCandidatesAI,
  addStarterPairingsFromImageUrlsAI,
  addStarterPairingsFromMenuTextAI,
  addStarterPairingsFromPdfUrlAI,
  type StarterPairingCandidate
} from "../../../src/ai/recommendStarterPairingsAI";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import {
  extractHtmlMenuFromUrl,
  htmlMenuExtractionToDishes,
  htmlMenuExtractionToMenuText
} from "../../../src/menu/extraction/extractHtmlMenu";
import { findLinkedMenuImageUrls, looksLikeImageUrl } from "../../../src/menu/findLinkedMenuImageUrls";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import type { AnalyzeMenuRequest } from "../../../src/types/api";
import type { Dish } from "../../../src/types/menu";
import type { Recommendation } from "../../../src/types/recommendations";

type StarterPairingsRequest = AnalyzeMenuRequest & {
  dishes: Dish[];
  recommendations: Recommendation[];
  targetDishId?: string;
};

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = (await request.json()) as StarterPairingsRequest;
    const outputLocale = normalizeTargetLocale(body.profile.outputLocale);

    if (body.sourceKind !== "text") {
      throw new AppError(400, "SOURCE_KIND_UNSUPPORTED", "Diese Art von Speisekarte wird in V1 noch nicht unterstützt.");
    }

    const targetRecommendations = selectTargetRecommendations(body.recommendations, body.targetDishId);

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
      addStarterPairingsForSource({
        menuText,
        dishes: body.dishes,
        recommendations: targetRecommendations,
        allRecommendations: body.recommendations,
        profile: body.profile,
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
    if (isRateLimitError(error)) {
      return errorResponse(new AppError(
        429,
        "AI_RATE_LIMIT",
        "Ich kann die Vorspeise gerade nicht sicher raussuchen. Bitte versuche es gleich noch einmal."
      ));
    }

    if (error instanceof Error && error.message.includes("STARTER_PAIRING_TIMEOUT")) {
      return errorResponse(new AppError(
        422,
        "STARTER_PAIRING_UNAVAILABLE",
        "Ich kann die Vorspeise gerade nicht sicher raussuchen."
      ));
    }

    return errorResponse(error);
  }
}

async function addStarterPairingsForSource({
  menuText,
  dishes,
  recommendations,
  allRecommendations,
  profile,
  userLocale
}: {
  menuText: string;
  dishes: Dish[];
  recommendations: Recommendation[];
  allRecommendations: Recommendation[];
  profile: AnalyzeMenuRequest["profile"];
  userLocale: string;
}) {
  const structuredCandidates = buildStarterCandidatesFromDishes(dishes);

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

function buildStarterCandidatesFromDishes(dishes: Dish[]): StarterPairingCandidate[] {
  return dishes
    .filter((dish) => dish.dishRole === "starter")
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
