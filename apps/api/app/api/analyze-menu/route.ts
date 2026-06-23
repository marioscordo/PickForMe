import { NextResponse } from "next/server";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { parseMenu } from "../../../src/menu/parseMenu";
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

    const dishes = parseMenu(body.menuText);

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
