import { NextResponse } from "next/server";
import {
  recommendConcreteWineForMainDishAI,
  type ConcreteWineRecommendation
} from "../../../src/ai/recommendConcreteWineForMainDishAI";
import { type WineMainDishAnchor } from "../../../src/ai/recommendWineForMainDishAI";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import { extractWineCandidates } from "../../../src/wine/extractWineCandidates";
import {
  sanitizeWineProfileForRecommendation,
  type WineRecommendationProfile
} from "../../../src/wine/wineProfile";

type WineMenuRecommendationRequest = {
  mainDish?: WineMainDishAnchor;
  menuText?: string;
  menuUrls?: string[];
  profile?: WineRecommendationProfile;
  userLocale?: string;
};

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = (await request.json()) as WineMenuRecommendationRequest;
    const mainDish = normalizeMainDish(body.mainDish);

    if (!mainDish) {
      throw new AppError(400, "MAIN_DISH_REQUIRED", "Bitte waehle zuerst ein Gericht aus.");
    }

    if (!body.profile) {
      throw new AppError(400, "PROFILE_REQUIRED", "Bitte pruefe zuerst Dein Profil.");
    }

    const profile = sanitizeWineProfileForRecommendation(body.profile);
    const menuSourceText = await loadWineMenuSourceText(body);
    const wineCandidates = extractWineCandidates(menuSourceText);

    if (wineCandidates.length === 0) {
      return wineMenuResponse(null);
    }

    const source = {
      kind: "text" as const,
      text: [
        "Originale Weinkartenquelle:",
        menuSourceText,
        "",
        "Vorstrukturierte WineCandidates:",
        JSON.stringify(wineCandidates)
      ].join("\n")
    };
    const recommendation = await withTimeout(
      recommendConcreteWineForMainDishAI({
        source,
        profile,
        mainDish,
        wineCandidates,
        userLocale: body.userLocale
      }),
      25000,
      "WINE_MENU_RECOMMENDATION_TIMEOUT"
    );

    return wineMenuResponse(recommendation);
  } catch (error) {
    return errorResponse(error);
  }
}

function wineMenuResponse(recommendation: ConcreteWineRecommendation | null) {
  return NextResponse.json({
    ok: true,
    data: {
      recommendation
    }
  });
}

async function loadWineMenuSourceText(body: WineMenuRecommendationRequest) {
  const directText = body.menuText?.trim() ?? "";

  if (directText && !looksLikeUrl(directText)) {
    return directText;
  }

  const sourceUrls = [
    directText && looksLikeUrl(directText) ? directText : "",
    ...(body.menuUrls ?? [])
  ].filter((value) => value.trim().length > 0);

  for (const sourceUrl of sourceUrls) {
    try {
      const loadedText = await loadMenuTextFromUrl(sourceUrl);

      if (loadedText.trim().length >= 20) {
        return loadedText;
      }
    } catch {
      // Concrete wine search is optional. If source loading fails, return no match.
    }
  }

  return directText;
}

function normalizeMainDish(value: unknown): WineMainDishAnchor | null {
  if (!isRecord(value) || typeof value.nameOriginal !== "string" || !value.nameOriginal.trim()) {
    return null;
  }

  return {
    rank: typeof value.rank === "number" ? value.rank : undefined,
    nameOriginal: value.nameOriginal.trim(),
    translatedName: stringField(value.translatedName),
    descriptionOriginal: nullableStringField(value.descriptionOriginal),
    translatedDescription: nullableStringField(value.translatedDescription),
    sourceEvidence: nullableStringField(value.sourceEvidence),
    reason: stringField(value.reason)
  };
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
