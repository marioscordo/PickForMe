import { NextResponse } from "next/server";
import { recommendWineForMainDishAI, type WineMainDishAnchor } from "../../../src/ai/recommendWineForMainDishAI";
import { requireUser } from "../../../src/auth/requireUser";
import { profileFeatures } from "../../../src/config/profileFeatures";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { MenuLanguageSchema, type MenuLanguage } from "../../../src/ai/twoStepRecommendationSchemas";
import {
  sanitizeWineProfileForRecommendation,
  type WineRecommendationProfile
} from "../../../src/wine/wineProfile";

type WineRecommendationRequest = {
  mainDish?: WineMainDishAnchor;
  profile?: WineRecommendationProfile;
  userLocale?: string;
  // Damit sommelierPhrase in der Sprache der Original-Speisekarte statt der
  // Nutzersprache formuliert werden kann (Mario, Aug 2026) - kommt vom
  // Mobile-Client aus AnalyzeData.menuLanguage der vorherigen Analyse.
  menuLanguage?: MenuLanguage;
};

export async function POST(request: Request) {
  try {
    await requireUser(request);

    if (!profileFeatures.wineFeatureEnabled) {
      throw new AppError(403, "FEATURE_DISABLED", "Weinempfehlungen sind derzeit nicht verfügbar.");
    }

    const body = (await request.json()) as WineRecommendationRequest;
    const mainDish = normalizeMainDish(body.mainDish);

    if (!mainDish) {
      throw new AppError(400, "MAIN_DISH_REQUIRED", "Bitte waehle zuerst ein Gericht aus.");
    }

    if (!body.profile) {
      throw new AppError(400, "PROFILE_REQUIRED", "Bitte pruefe zuerst Dein Profil.");
    }

    const profile = sanitizeWineProfileForRecommendation(body.profile);
    const menuLanguage = normalizeMenuLanguage(body.menuLanguage);
    const source = {
      kind: "text" as const,
      text: [
        mainDish.nameOriginal,
        mainDish.translatedName,
        mainDish.descriptionOriginal,
        mainDish.translatedDescription,
        mainDish.sourceEvidence,
        mainDish.reason
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n")
    };

    const recommendation = await withTimeout(
      recommendWineForMainDishAI({
        source,
        profile,
        mainDish,
        userLocale: body.userLocale,
        menuLanguage
      }),
      30000,
      "WINE_RECOMMENDATION_TIMEOUT",
      "Die Weinempfehlung hat zu lange gedauert. Bitte versuche es erneut."
    );

    return NextResponse.json({
      ok: true,
      data: {
        recommendation
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
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

function normalizeMenuLanguage(value: unknown): MenuLanguage | undefined {
  const parsed = MenuLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string, errorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AppError(503, errorCode, errorMessage, { retryable: true })),
      timeoutMs
    );

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
