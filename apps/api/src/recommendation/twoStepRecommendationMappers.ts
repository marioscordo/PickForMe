import type { Dish, DishRoleTag } from "../types/menu";
import type { RequestedDishRole } from "../types/api";
import type { Recommendation, StarterPairing } from "../types/recommendations";
import {
  CommittedMainDishRecommendationSchema,
  CommittedStarterRecommendationSchema,
  MainDishAIRecommendationSchema,
  StarterAIRecommendationSchema,
  type CommittedMainDishRecommendation,
  type CommittedStarterRecommendation,
  type MainDishAIRecommendation,
  type StarterAIRecommendation
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

export function mapGatekeptMainRecommendationsToAnalyzeData(
  values: unknown[],
  requestedDishRoles: RequestedDishRole[] = ["main"]
): TwoStepAnalyzeDataParts {
  const roleMetadata = buildRequestedDishRoleMetadata(requestedDishRoles);
  const accepted = values
    .map((value) => MainDishAIRecommendationSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .filter(isGatekeeperSafeMainRecommendation);

  const dishes: Dish[] = accepted.map((item, index) => {
    const evidence = normalizeOptionalString(item.sourceEvidence);
    const descriptionOriginal = normalizeOptionalString(item.descriptionOriginal);
    const translatedDescription = normalizeOptionalString(item.translatedDescription);

    return {
      id: `gatekept_main_${String(index + 1).padStart(3, "0")}`,
      nameOriginal: item.nameOriginal,
      ...(translatedDescription || descriptionOriginal ? { description: translatedDescription ?? descriptionOriginal } : {}),
      ...(descriptionOriginal ? { descriptionOriginal } : {}),
      price: parseOptionalPrice(item.priceRaw),
      category: roleMetadata.category,
      itemType: "dish",
      sourceFormat: "ai",
      sourceCategoryOriginal: normalizeOptionalString(item.sourceCategoryOriginal),
      sourceUrl: normalizeOptionalString(item.sourceUrl),
      dishRole: roleMetadata.dishRole,
      dishRoles: roleMetadata.dishRoles,
      primaryRole: roleMetadata.primaryRole,
      roleConfidence: confidenceToRoleConfidence(item.confidence),
      roleEvidence: evidence,
      isMainCourseCandidate: roleMetadata.primaryRole === "main",
      isSafeRecommendationCandidate: true,
      sourceLine: buildFullSourceLine({
        nameOriginal: item.nameOriginal,
        descriptionOriginal,
        evidence
      })
    };
  });

  const recommendations: Recommendation[] = accepted.map((item, index) => ({
    dishId: dishes[index]!.id,
    rank: item.rank,
    reason: item.reason,
    facts: normalizeOptionalString(item.sourceEvidence),
    translatedName: item.translatedName,
    ...(normalizeOptionalString(item.translatedDescription) ? { translatedDescription: normalizeOptionalString(item.translatedDescription) } : {}),
    ...(normalizeOptionalString(item.descriptionOriginal) ? { descriptionOriginal: normalizeOptionalString(item.descriptionOriginal) } : {})
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

export function mapGatekeptStarterRecommendationToRecommendation({
  recommendation,
  starter
}: {
  recommendation: Recommendation;
  starter: unknown;
}): Recommendation | RecommendationWithTwoStepStarter {
  const parsed = StarterAIRecommendationSchema.safeParse(starter);

  if (!parsed.success || !isGatekeeperSafeStarterRecommendation(parsed.data)) {
    return recommendation;
  }

  return {
    ...recommendation,
    starter: {
      nameOriginal: parsed.data.nameOriginal,
      translatedName: parsed.data.translatedName,
      priceRaw: normalizeOptionalString(parsed.data.priceRaw),
      evidence: normalizeOptionalString(parsed.data.sourceEvidence),
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

function isGatekeeperSafeMainRecommendation(value: MainDishAIRecommendation) {
  return value.confidence !== "low" &&
    value.profileSafety.hasKnownConflict === false &&
    value.profileSafety.uncertainForAllergy === false;
}

function isGatekeeperSafeStarterRecommendation(value: StarterAIRecommendation) {
  return value.confidence !== "low" &&
    value.profileSafety.hasKnownConflict === false &&
    value.profileSafety.uncertainForAllergy === false;
}

function buildRequestedDishRoleMetadata(values: RequestedDishRole[]) {
  const includesStarterOrSalad = values.includes("starter") || values.includes("salad");

  if (includesStarterOrSalad) {
    return {
      category: "AI-Vorspeisen-/Salatempfehlung",
      dishRole: "starter" as const,
      dishRoles: ["starter", "salad"] satisfies DishRoleTag[],
      primaryRole: "starter" as const
    };
  }

  return {
    category: "AI-Hauptempfehlung",
    dishRole: "main" as const,
    dishRoles: ["main"] satisfies DishRoleTag[],
    primaryRole: "main" as const
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized || isTechnicalPlaceholder(normalized)) {
    return undefined;
  }

  return normalized;
}

function isTechnicalPlaceholder(value: string) {
  return /^(?:null|undefined|n\/a|nan)$/i.test(value.trim());
}

function buildFullSourceLine({
  nameOriginal,
  descriptionOriginal,
  evidence
}: {
  nameOriginal: string;
  descriptionOriginal?: string;
  evidence?: string;
}) {
  return [nameOriginal, descriptionOriginal, evidence]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}

function parseOptionalPrice(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return undefined;

  const match = normalized.replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;

  const price = Number(match[1]);
  return Number.isFinite(price) ? price : undefined;
}

function confidenceToRoleConfidence(value: "high" | "medium" | "low") {
  if (value === "high") return 0.95;
  if (value === "medium") return 0.75;
  return 0.4;
}
