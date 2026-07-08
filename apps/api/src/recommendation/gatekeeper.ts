import {
  MainDishAIRecommendationSchema,
  StarterAIRecommendationSchema,
  type MainDishAIRecommendation,
  type StarterAIRecommendation,
  type TwoStepProfileSafety
} from "../ai/twoStepRecommendationSchemas";

export type GatekeeperRejectReason =
  | "missing_recommendation"
  | "invalid_structure"
  | "missing_name_original"
  | "missing_translated_name"
  | "missing_reason"
  | "missing_pairing_reason"
  | "missing_target_main_dish_name_original"
  | "low_confidence"
  | "missing_profile_safety"
  | "known_profile_conflict"
  | "uncertain_for_allergy";

export type GatekeeperRejection = {
  index?: number;
  rank?: number;
  nameOriginal?: string;
  reason: GatekeeperRejectReason;
};

export type MainDishGatekeeperResult = {
  accepted: MainDishAIRecommendation[];
  rejected: GatekeeperRejection[];
};

export type StarterGatekeeperResult = {
  accepted: StarterAIRecommendation | null;
  rejected: GatekeeperRejection | null;
};

export function gatekeepMainDishRecommendations(values: readonly unknown[]): MainDishGatekeeperResult {
  const accepted: MainDishAIRecommendation[] = [];
  const rejected: GatekeeperRejection[] = [];

  values.forEach((value, index) => {
    const structuralReason = getMainDishStructuralRejectReason(value);

    if (structuralReason) {
      rejected.push(buildRejection(value, structuralReason, index));
      return;
    }

    const parsed = MainDishAIRecommendationSchema.safeParse(value);

    if (!parsed.success) {
      rejected.push(buildRejection(value, "invalid_structure", index));
      return;
    }

    const safetyReason = getProfileSafetyRejectReason(parsed.data.profileSafety);

    if (safetyReason) {
      rejected.push(buildRejection(parsed.data, safetyReason, index));
      return;
    }

    accepted.push(parsed.data);
  });

  return {
    accepted,
    rejected
  };
}

export function gatekeepStarterRecommendation(value: unknown): StarterGatekeeperResult {
  if (value === null || value === undefined) {
    return {
      accepted: null,
      rejected: {
        reason: "missing_recommendation"
      }
    };
  }

  const structuralReason = getStarterStructuralRejectReason(value);

  if (structuralReason) {
    return {
      accepted: null,
      rejected: buildRejection(value, structuralReason)
    };
  }

  const parsed = StarterAIRecommendationSchema.safeParse(value);

  if (!parsed.success) {
    return {
      accepted: null,
      rejected: buildRejection(value, "invalid_structure")
    };
  }

  const safetyReason = getProfileSafetyRejectReason(parsed.data.profileSafety);

  if (safetyReason) {
    return {
      accepted: null,
      rejected: buildRejection(parsed.data, safetyReason)
    };
  }

  return {
    accepted: parsed.data,
    rejected: null
  };
}

function getMainDishStructuralRejectReason(value: unknown): GatekeeperRejectReason | null {
  if (!isRecord(value)) {
    return "invalid_structure";
  }

  if (!hasText(value.nameOriginal)) {
    return "missing_name_original";
  }

  if (!hasText(value.translatedName)) {
    return "missing_translated_name";
  }

  if (!hasText(value.reason)) {
    return "missing_reason";
  }

  if (value.confidence === "low") {
    return "low_confidence";
  }

  if (!isRecord(value.profileSafety)) {
    return "missing_profile_safety";
  }

  return null;
}

function getStarterStructuralRejectReason(value: unknown): GatekeeperRejectReason | null {
  if (!isRecord(value)) {
    return "invalid_structure";
  }

  if (!hasText(value.targetMainDishNameOriginal)) {
    return "missing_target_main_dish_name_original";
  }

  if (!hasText(value.nameOriginal)) {
    return "missing_name_original";
  }

  if (!hasText(value.translatedName)) {
    return "missing_translated_name";
  }

  if (!hasText(value.pairingReason)) {
    return "missing_pairing_reason";
  }

  if (value.confidence === "low") {
    return "low_confidence";
  }

  if (!isRecord(value.profileSafety)) {
    return "missing_profile_safety";
  }

  return null;
}

function getProfileSafetyRejectReason(profileSafety: TwoStepProfileSafety): GatekeeperRejectReason | null {
  if (profileSafety.hasKnownConflict) {
    return "known_profile_conflict";
  }

  if (profileSafety.uncertainForAllergy) {
    return "uncertain_for_allergy";
  }

  return null;
}

function buildRejection(value: unknown, reason: GatekeeperRejectReason, index?: number): GatekeeperRejection {
  return {
    index,
    rank: getNumberField(value, "rank") ?? getNumberField(value, "targetMainDishRank"),
    nameOriginal: getStringField(value, "nameOriginal"),
    reason
  };
}

function getNumberField(value: unknown, field: string) {
  if (!isRecord(value) || typeof value[field] !== "number") {
    return undefined;
  }

  return value[field];
}

function getStringField(value: unknown, field: string) {
  if (!isRecord(value) || typeof value[field] !== "string") {
    return undefined;
  }

  const trimmed = value[field].trim();
  return trimmed || undefined;
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
