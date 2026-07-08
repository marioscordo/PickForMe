import type { Dish } from "../types/menu";
import type { Recommendation, StarterPairing } from "../types/recommendations";
import {
  CommittedMainDishRecommendationSchema,
  CommittedStarterRecommendationSchema,
  type CommittedMainDishRecommendation,
  type CommittedStarterRecommendation
} from "../ai/twoStepRecommendationSchemas";

export type TwoStepAnalyzeDataParts = {
  dishes: Dish[];
  recommendations: Recommendation[];
};

export type TwoStepStarterPairing = StarterPairing & {
  pairingReason: string;
};

export type RecommendationWithTwoStepStarter = Recommendation & {
  starter: TwoStepStarterPairing;
};

export function mapCommittedMainRecommendationsToAnalyzeData(
  values: unknown[]
): TwoStepAnalyzeDataParts {
  const committed = values
    .map((value) => CommittedMainDishRecommendationSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter(hasRequiredMainEvidence);

  const dishes: Dish[] = committed.map((item, index) => ({
    id: `two_step_main_${String(index + 1).padStart(3, "0")}`,
    nameOriginal: item.nameOriginal,
    price: parseOptionalPrice(item.priceRaw),
    category: "AI-Hauptempfehlung",
    itemType: "dish",
    sourceFormat: "ai",
    dishRole: "main",
    dishRoles: ["main"],
    primaryRole: "main",
    roleConfidence: confidenceToRoleConfidence(item.confidence),
    roleEvidence: item.sourceEvidence,
    isMainCourseCandidate: true,
    isSafeRecommendationCandidate: true,
    sourceLine: item.sourceEvidence
  }));

  const recommendations: Recommendation[] = committed.map((item, index) => ({
    dishId: dishes[index]!.id,
    rank: item.rank,
    reason: item.reason,
    facts: item.sourceEvidence,
    translatedName: item.translatedName
  }));

  return {
    dishes,
    recommendations
  };
}

export function mapCommittedStarterPairingToRecommendation({
  recommendation,
  starter
}: {
  recommendation: Recommendation;
  starter: unknown;
}): Recommendation | RecommendationWithTwoStepStarter {
  const parsed = CommittedStarterRecommendationSchema.safeParse(starter);

  if (!parsed.success || !hasRequiredStarterEvidence(parsed.data)) {
    return recommendation;
  }

  return {
    ...recommendation,
    starter: {
      nameOriginal: parsed.data.nameOriginal,
      translatedName: parsed.data.translatedName,
      priceRaw: normalizeOptionalString(parsed.data.priceRaw),
      evidence: parsed.data.sourceEvidence,
      pairingReason: parsed.data.pairingReason
    }
  };
}

function hasRequiredMainEvidence(value: CommittedMainDishRecommendation) {
  return value.sourceEvidence.trim().length > 0;
}

function hasRequiredStarterEvidence(value: CommittedStarterRecommendation) {
  return value.sourceEvidence.trim().length > 0;
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized || undefined;
}

function parseOptionalPrice(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return undefined;

  const match = normalized.replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;

  const price = Number(match[1]);
  return Number.isFinite(price) ? price : undefined;
}

function confidenceToRoleConfidence(value: "high" | "medium") {
  return value === "high" ? 0.95 : 0.75;
}
