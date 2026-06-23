import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/requireUser";
import { askPickForMeAI } from "../../../src/ai/askPickForMeAI";
import { askPickForMePdfUrlAI } from "../../../src/ai/askPickForMePdfUrlAI";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { parseMenu } from "../../../src/menu/parseMenu";
import { loadMenuTextFromUrl, looksLikeUrl } from "../../../src/menu/loadMenuTextFromUrl";
import { recommendDishes } from "../../../src/recommendation/recommendDishes";
import type { AnalyzeMenuRequest } from "../../../src/types/api";

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = (await request.json()) as AnalyzeMenuRequest;

    if (body.sourceKind !== "text") {
      throw new AppError(400, "SOURCE_KIND_UNSUPPORTED", "In V1 wird zuerst Texteingabe unterstützt.");
    }

    if (!body.menuText || body.menuText.trim().length < 20) {
      throw new AppError(400, "MENU_TOO_SHORT", "Bitte zuerst eine Speisekarte einfügen.");
    }

    const rawMenuText = body.menuText.trim();
    const isPdfUrl = looksLikeUrl(rawMenuText) && new URL(rawMenuText).pathname.toLowerCase().endsWith(".pdf");

    if (isPdfUrl) {
      if (process.env.PICKFORME_AI_ENABLED !== "true") {
        throw new AppError(400, "PDF_AI_DISABLED", "PDF-Speisekarten benötigen in V1 den KI-Modus.");
      }

      const aiResult = await askPickForMePdfUrlAI({
        pdfUrl: rawMenuText,
        profile: body.profile,
        situation: body.situation
      });

      return NextResponse.json({
        ok: true,
        data: {
          mode: "ai_pdf",
          dishes: aiResult.dishes,
          recommendations: aiResult.recommendations
        }
      });
    }

    const effectiveMenuText = looksLikeUrl(rawMenuText)
      ? await loadMenuTextFromUrl(rawMenuText)
      : rawMenuText;

    if (effectiveMenuText.trim().length < 20) {
      throw new AppError(400, "MENU_TOO_SHORT", "Aus dieser Eingabe konnte kein ausreichender Speisekartentext gelesen werden.");
    }

    if (process.env.PICKFORME_AI_ENABLED === "true") {
      try {
        const aiResult = await askPickForMeAI({
          menuText: effectiveMenuText,
          profile: body.profile,
          situation: body.situation
        });

        return NextResponse.json({
          ok: true,
          data: {
            mode: "ai",
            dishes: aiResult.dishes,
            recommendations: aiResult.recommendations
          }
        });
      } catch (aiError) {
        console.error("PickForMe AI failed, falling back to local recommendation.", aiError);
      }
    }

    const dishes = parseMenu(effectiveMenuText);

    if (dishes.length === 0) {
      throw new AppError(400, "NO_DISHES_FOUND", "PickForMe konnte noch keine Gerichte erkennen.");
    }

    const recommendations = recommendDishes({
      dishes,
      profile: body.profile,
      situation: body.situation
    });

    return NextResponse.json({
      ok: true,
      data: {
        mode: "fallback",
        dishes,
        recommendations
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
