import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { searchRestaurantCandidates } from "../../../src/restaurant/searchRestaurantCandidates";

const RestaurantDiscoveryRequestSchema = z.object({
  restaurantName: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(120)
});

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = RestaurantDiscoveryRequestSchema.parse(await request.json());
    const data = await searchRestaurantCandidates(body);

    return NextResponse.json({
      ok: true,
      data
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError(400, "RESTAURANT_DISCOVERY_INVALID_REQUEST", "Bitte Restaurantname und Ort angeben.", error.issues)
      );
    }

    return errorResponse(error);
  }
}
