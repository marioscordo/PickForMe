import { NextResponse } from "next/server";
import { generateAllergyStaffQuestionAI } from "../../../src/ai/generateAllergyStaffQuestionAI";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { MenuLanguageSchema, type MenuLanguage } from "../../../src/ai/twoStepRecommendationSchemas";
import type { UserProfile } from "../../../src/types/profile";

// Produktidee Aug 2026 (Mario): eigener, schlanker Endpoint statt einer
// Erweiterung von /api/analyze-menu - wird nur bei Bedarf aufgerufen (der
// Nutzer bestaetigt aktiv "ja, formuliere mir die Frage"), nicht bei jedem
// gescheiterten Analyse-Versuch mitgeneriert. Spart KI-Kosten/Latenz fuer
// den haeufigeren Fall, dass der Nutzer die Frage gar nicht braucht/will.
type AllergyStaffQuestionRequest = {
  profile?: UserProfile;
  menuLanguage?: MenuLanguage;
};

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = (await request.json()) as AllergyStaffQuestionRequest;

    if (!body.profile) {
      throw new AppError(400, "PROFILE_REQUIRED", "Bitte pruefe zuerst Dein Profil.");
    }

    const menuLanguage = normalizeMenuLanguage(body.menuLanguage);

    const result = await withTimeout(
      generateAllergyStaffQuestionAI({
        profile: body.profile,
        menuLanguage
      }),
      20000,
      "ALLERGY_STAFF_QUESTION_TIMEOUT",
      "Die Frage konnte nicht rechtzeitig erstellt werden. Bitte versuche es erneut."
    );

    return NextResponse.json({
      ok: true,
      data: {
        question: result?.question ?? null
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function normalizeMenuLanguage(value: unknown): MenuLanguage | undefined {
  const parsed = MenuLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
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
