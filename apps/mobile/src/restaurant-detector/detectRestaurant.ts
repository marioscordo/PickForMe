import { buildRestaurantDetectionResult } from "./scoring";
import type { RestaurantDetectionResult, RestaurantDetectorInput, RestaurantDetectorProvider } from "./types";

export async function detectRestaurant(
  input: RestaurantDetectorInput,
  provider: RestaurantDetectorProvider
): Promise<RestaurantDetectionResult> {
  if (!isUsableLocation(input)) {
    return {
      candidates: [],
      confidence: "low",
      requiresUserConfirmation: true
    };
  }

  const providerCandidates = await provider.detect(input);
  return buildRestaurantDetectionResult(input, providerCandidates);
}

function isUsableLocation(input: RestaurantDetectorInput) {
  return Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude) &&
    Number.isFinite(input.accuracyMeters) &&
    input.accuracyMeters > 0;
}
