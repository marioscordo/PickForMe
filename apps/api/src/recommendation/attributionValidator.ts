import type { UserProfile } from "../types/profile";
import type {
  MainDishAIAnalyzedDish,
  MainDishAIRecommendation,
  MainDishAIRemovedDish,
  MainDishAIResultSummary,
  MainDishAISafeCandidate
} from "../ai/twoStepRecommendationSchemas";
import {
  verifyAttributionEvidenceAI,
  type AttributionEvidenceCheck,
  type AttributionEvidenceProfileType,
  type AttributionEvidenceResult,
  type AttributionEvidenceVerdict
} from "../ai/verifyAttributionEvidenceAI";
import { isAnalyzeDiagnosticsEnabled } from "../ai/twoStepRecommendationDiagnostics";

type EvidenceSource = "name" | "description";

type MainDishAttributionResponse = {
  allDishes: MainDishAIAnalyzedDish[];
  removedDishes: MainDishAIRemovedDish[];
  safeCandidates: MainDishAISafeCandidate[];
  recommendations: MainDishAIRecommendation[];
  resultSummary: MainDishAIResultSummary;
};

export type MainDishAttributionValidationResponse = MainDishAttributionResponse & {
  attributionNotConfirmed: boolean;
  attributionFailureReason?: AttributionFailureReason;
};

type AttributionFailureReason =
  | "no_active_profile_match"
  | "no_evidence_checks"
  | "evidence_invalid"
  | "evidence_uncertain"
  | "no_valid_attribution_after_backfill";

type PendingAttribution = {
  key: string;
  profileType: AttributionEvidenceProfileType;
  profileValue: string;
  nameOriginal: string;
  descriptionOriginal?: string | null;
};

type AttributionDiagnostic = {
  kind: "recommendation" | "recommendationPayload";
  stableId: string;
  dishName: string;
  matchedProfileValue?: string | null;
  profileEvidence?: string | null;
  evidenceSource?: string | null;
  activeProfileValueMatch: boolean;
  evidenceLiteralMatch: boolean;
  localNormalformMatch: boolean;
  status: "direct-valid" | "pending-evidence" | "invalid";
  invalidReason?: "missing_profile_value" | "inactive_profile_value";
  attributionKey?: string;
  attributionId?: string;
  evidenceVerdict?: AttributionEvidenceVerdict;
};

type AttributionCheckInput = {
  matchedValue: string | null | undefined;
  activeProfileValues: string[];
  profileType: AttributionEvidenceProfileType;
  nameOriginal: string;
  descriptionOriginal?: string | null;
};

export async function validateMainDishAttributions(
  response: MainDishAttributionResponse,
  profile: UserProfile,
  runId?: string,
  signal?: AbortSignal
): Promise<MainDishAttributionValidationResponse> {
  const activePreferences = uniqueValues(arrayValue(profile.primaryLikes));
  const activeExclusions = uniqueValues(arrayValue(profile.customExclusions));
  const activeAllergens = uniqueValues(arrayValue(profile.allergens));
  const pendingAttributions = new Map<string, PendingAttribution>();
  const removedAttributionChecks = new Map<MainDishAIRemovedDish, AttributionVerdictHandle>();
  const candidatePayloadAttributionChecks = new Map<MainDishAISafeCandidate, AttributionVerdictHandle>();
  const recommendationAttributionChecks = new Map<MainDishAIRecommendation, AttributionVerdictHandle>();
  const attributionDiagnostics: AttributionDiagnostic[] = [];
  const allDishesByName = new Map(response.allDishes.map((dish) => [normalizeAttributionText(dish.nameOriginal), dish]));
  const safeCandidatesByName = new Map(response.safeCandidates.map((candidate) => [normalizeAttributionText(candidate.nameOriginal), candidate]));

  for (const dish of response.removedDishes) {
    const sourceDish = allDishesByName.get(normalizeAttributionText(dish.nameOriginal));
    removedAttributionChecks.set(dish, buildAttributionVerdictHandle({
      matchedValue: dish.matchedProfileValue,
      activeProfileValues: activeAllergens.includes(dish.matchedProfileValue)
        ? activeAllergens
        : activeExclusions,
      profileType: activeAllergens.includes(dish.matchedProfileValue) ? "allergen" : "exclusion",
      nameOriginal: sourceDish?.nameOriginal ?? dish.nameOriginal,
      descriptionOriginal: sourceDish?.descriptionOriginal
    }, pendingAttributions));
  }

  for (const candidate of response.safeCandidates) {
    const payload = candidate.recommendationPayload;

    if (!payload || activePreferences.length === 0) {
      continue;
    }

    const canonicalSource = getCanonicalCandidateSource(candidate, allDishesByName);
    const handle = buildAttributionVerdictHandle({
      matchedValue: payload.matchedPreferenceValue,
      activeProfileValues: activePreferences,
      profileType: "preference",
      nameOriginal: canonicalSource.nameOriginal,
      descriptionOriginal: canonicalSource.descriptionOriginal
    }, pendingAttributions);
    candidatePayloadAttributionChecks.set(candidate, handle);
    attributionDiagnostics.push(buildAttributionDiagnostic({
      kind: "recommendationPayload",
      stableId: `candidate_${response.safeCandidates.indexOf(candidate)}`,
      dishName: canonicalSource.nameOriginal,
      input: {
        matchedValue: payload.matchedPreferenceValue,
        activeProfileValues: activePreferences,
        profileType: "preference",
        nameOriginal: canonicalSource.nameOriginal,
        descriptionOriginal: canonicalSource.descriptionOriginal
      },
      handle
    }));
  }

  for (const recommendation of response.recommendations) {
    if (activePreferences.length === 0) {
      continue;
    }

    const canonicalSource = getCanonicalRecommendationSource(recommendation, safeCandidatesByName, allDishesByName);
    const handle = buildAttributionVerdictHandle({
      matchedValue: recommendation.matchedPreferenceValue,
      activeProfileValues: activePreferences,
      profileType: "preference",
      nameOriginal: canonicalSource.nameOriginal,
      descriptionOriginal: canonicalSource.descriptionOriginal
    }, pendingAttributions);
    recommendationAttributionChecks.set(recommendation, handle);
    attributionDiagnostics.push(buildAttributionDiagnostic({
      kind: "recommendation",
      stableId: `recommendation_${recommendation.rank}`,
      dishName: canonicalSource.nameOriginal,
      input: {
        matchedValue: recommendation.matchedPreferenceValue,
        activeProfileValues: activePreferences,
        profileType: "preference",
        nameOriginal: canonicalSource.nameOriginal,
        descriptionOriginal: canonicalSource.descriptionOriginal
      },
      handle
    }));
  }

  const { resultsByKey: evidenceResults, attributionIdsByKey } = await resolvePendingAttributions({
    pendingAttributions,
    runId,
    signal
  });
  logAttributionDiagnostics({
    diagnostics: attributionDiagnostics,
    evidenceResults,
    attributionIdsByKey,
    runId
  });
  const safeCandidateKeys = new Set(response.safeCandidates.map((candidate) => normalizeAttributionText(candidate.nameOriginal)));
  const restoredCandidates: MainDishAISafeCandidate[] = [];
  let attributionNotConfirmed = false;
  const removedDishes = response.removedDishes.filter((dish) => {
    const handle = removedAttributionChecks.get(dish);
    const verdict = handle ? resolveAttributionVerdict(handle, evidenceResults) : "uncertain";

    if (verdict !== "valid") {
      const sourceDish = allDishesByName.get(normalizeAttributionText(dish.nameOriginal));
      const key = normalizeAttributionText(sourceDish?.nameOriginal ?? dish.nameOriginal);

      if (!safeCandidateKeys.has(key)) {
        restoredCandidates.push(buildRestoredSafeCandidate(sourceDish, dish.nameOriginal));
        safeCandidateKeys.add(key);
      }

      return false;
    }

    return true;
  });

  const safeCandidates = [...response.safeCandidates, ...restoredCandidates].map((candidate) => {
    const handle = candidatePayloadAttributionChecks.get(candidate);

    if (activePreferences.length === 0 && candidate.recommendationPayload) {
      return {
        ...candidate,
        recommendationPayload: neutralizeRecommendationPayload(candidate.recommendationPayload, profile.outputLocale)
      };
    }

    if (!handle) {
      return candidate;
    }

    const payload = candidate.recommendationPayload;
    const verdict = resolveAttributionVerdict(handle, evidenceResults);

    if (payload && verdict === "valid") {
      return {
        ...candidate,
        recommendationPayload: {
          ...payload,
          reason: buildDeterministicPreferenceReason(payload.matchedPreferenceValue, profile.outputLocale)
        }
      };
    }

    if (payload) {
      return {
        ...candidate,
        recommendationPayload: neutralizeRecommendationPayload(payload, profile.outputLocale)
      };
    }

    return candidate;
  });

  const recommendations = activePreferences.length === 0
    ? response.recommendations.map((recommendation) => neutralizeRecommendation(recommendation, profile.outputLocale))
    : response.recommendations.map((recommendation) => {
      const handle = recommendationAttributionChecks.get(recommendation);
      const verdict = handle ? resolveAttributionVerdict(handle, evidenceResults) : "uncertain";

      if (verdict === "valid") {
        return {
          ...recommendation,
          reason: buildDeterministicPreferenceReason(recommendation.matchedPreferenceValue, profile.outputLocale)
        };
      }

      return neutralizeRecommendation(recommendation, profile.outputLocale);
    });

  const attributionFailureReason = attributionNotConfirmed
    ? getAttributionFailureReason({
      diagnostics: attributionDiagnostics,
      evidenceResults
    })
    : undefined;

  return {
    ...response,
    removedDishes,
    safeCandidates,
    recommendations,
    attributionNotConfirmed,
    attributionFailureReason,
    resultSummary: {
      ...response.resultSummary,
      removedDishCount: removedDishes.length,
      safeCandidateCount: safeCandidates.length,
      recommendationCount: recommendations.length,
      lessThanThreeReason: recommendations.length < 3
        ? response.resultSummary.lessThanThreeReason
        : null
    }
  };
}

function getAttributionFailureReason({
  diagnostics,
  evidenceResults
}: {
  diagnostics: AttributionDiagnostic[];
  evidenceResults: Map<string, AttributionEvidenceResult>;
}): AttributionFailureReason {
  if (diagnostics.some((diagnostic) => diagnostic.invalidReason === "inactive_profile_value")) {
    return "no_active_profile_match";
  }

  const pendingDiagnostics = diagnostics.filter((diagnostic) => diagnostic.status === "pending-evidence");

  if (pendingDiagnostics.length === 0) {
    return "no_evidence_checks";
  }

  const verdicts = pendingDiagnostics.map((diagnostic) =>
    diagnostic.attributionKey ? evidenceResults.get(diagnostic.attributionKey)?.verdict ?? "uncertain" : "uncertain"
  );

  if (verdicts.includes("invalid")) {
    return "evidence_invalid";
  }

  if (verdicts.includes("uncertain")) {
    return "evidence_uncertain";
  }

  return "no_valid_attribution_after_backfill";
}

type AttributionVerdictHandle =
  | { kind: "direct"; verdict: AttributionEvidenceVerdict; profileEvidence?: string | null; evidenceSource?: EvidenceSource | null }
  | { kind: "pending"; key: string };

function buildAttributionDiagnostic({
  kind,
  stableId,
  dishName,
  input,
  handle
}: {
  kind: AttributionDiagnostic["kind"];
  stableId: string;
  dishName: string;
  input: AttributionCheckInput;
  handle: AttributionVerdictHandle;
}): AttributionDiagnostic {
  const activeValue = findActiveProfileValue(input.matchedValue, input.activeProfileValues);
  const directEvidence = handle.kind === "direct" && handle.verdict === "valid"
    ? { profileEvidence: handle.profileEvidence ?? null, evidenceSource: handle.evidenceSource ?? null }
    : null;
  const evidenceLiteralMatch = Boolean(directEvidence?.profileEvidence && directEvidence.evidenceSource);
  const localNormalformMatch = Boolean(directEvidence?.profileEvidence);
  const invalidReason = getAttributionInvalidReason({
    activeValue,
    input
  });

  return {
    kind,
    stableId,
    dishName,
    matchedProfileValue: input.matchedValue,
    profileEvidence: directEvidence?.profileEvidence,
    evidenceSource: directEvidence?.evidenceSource,
    activeProfileValueMatch: Boolean(activeValue),
    evidenceLiteralMatch,
    localNormalformMatch,
    status: handle.kind === "pending" ? "pending-evidence" : handle.verdict === "valid" ? "direct-valid" : "invalid",
    invalidReason,
    attributionKey: handle.kind === "pending" ? handle.key : undefined
  };
}

function getAttributionInvalidReason({
  activeValue,
  input
}: {
  activeValue: string | null;
  input: AttributionCheckInput;
}): AttributionDiagnostic["invalidReason"] {
  if (!input.matchedValue?.trim()) return "missing_profile_value";
  if (!activeValue) return "inactive_profile_value";
  return undefined;
}

function buildAttributionVerdictHandle(
  input: AttributionCheckInput,
  pendingAttributions: Map<string, PendingAttribution>
): AttributionVerdictHandle {
  const activeValue = findActiveProfileValue(input.matchedValue, input.activeProfileValues);

  if (!activeValue) {
    return { kind: "direct", verdict: "uncertain" };
  }

  const directEvidence = findDirectVisibleEvidence({
    profileValue: activeValue,
    nameOriginal: input.nameOriginal,
    descriptionOriginal: input.descriptionOriginal
  });

  if (directEvidence) {
    return {
      kind: "direct",
      verdict: "valid",
      profileEvidence: directEvidence.profileEvidence,
      evidenceSource: directEvidence.evidenceSource
    };
  }

  const key = buildAttributionKey(input.profileType, activeValue, input.nameOriginal, input.descriptionOriginal);

  if (!pendingAttributions.has(key)) {
    pendingAttributions.set(key, {
      key,
      profileType: input.profileType,
      profileValue: activeValue,
      nameOriginal: input.nameOriginal,
      descriptionOriginal: input.descriptionOriginal
    });
  }

  return { kind: "pending", key };
}

async function resolvePendingAttributions({
  pendingAttributions,
  runId,
  signal
}: {
  pendingAttributions: Map<string, PendingAttribution>;
  runId?: string;
  signal?: AbortSignal;
}) {
  const checks = Array.from(pendingAttributions.values()).map((item, index): AttributionEvidenceCheck => ({
    attributionId: `attr_${index}`,
    profileType: item.profileType,
    profileValue: item.profileValue,
    nameOriginal: item.nameOriginal,
    descriptionOriginal: item.descriptionOriginal ?? null
  }));
  const keyByAttributionId = new Map(checks.map((check, index) => [check.attributionId, Array.from(pendingAttributions.values())[index]!.key]));
  const attributionIdsByKey = new Map(checks.map((check, index) => [Array.from(pendingAttributions.values())[index]!.key, check.attributionId]));
  const resultsByKey = new Map<string, AttributionEvidenceResult>();

  if (checks.length === 0) {
    return { resultsByKey, attributionIdsByKey };
  }

  let results: AttributionEvidenceResult[];

  try {
    results = await verifyAttributionEvidenceAI({
      checks,
      runId,
      signal
    });
  } catch {
    results = checks.map((check) => ({
      attributionId: check.attributionId,
      verdict: "uncertain",
      profileEvidence: null,
      evidenceSource: null
    }));
  }

  for (const result of results) {
    const key = keyByAttributionId.get(result.attributionId);

    if (key) {
      resultsByKey.set(key, result);
    }
  }

  return { resultsByKey, attributionIdsByKey };
}

function logAttributionDiagnostics({
  diagnostics,
  evidenceResults,
  attributionIdsByKey,
  runId
}: {
  diagnostics: AttributionDiagnostic[];
  evidenceResults: Map<string, AttributionEvidenceResult>;
  attributionIdsByKey: Map<string, string>;
  runId?: string;
}) {
  if (!isAnalyzeDiagnosticsEnabled() || diagnostics.length === 0) {
    return;
  }

  for (const diagnostic of diagnostics) {
    const attributionId = diagnostic.attributionKey ? attributionIdsByKey.get(diagnostic.attributionKey) : undefined;
    const evidenceResult = diagnostic.attributionKey ? evidenceResults.get(diagnostic.attributionKey) : undefined;
    const evidenceVerdict = evidenceResult?.verdict ?? (diagnostic.status === "direct-valid" ? "valid" : "uncertain");

    console.info(`[GUSTARO_ATTRIBUTION_DIAG] ${JSON.stringify({
      runId,
      ...diagnostic,
      profileEvidence: evidenceResult?.profileEvidence ?? diagnostic.profileEvidence,
      evidenceSource: evidenceResult?.evidenceSource ?? diagnostic.evidenceSource,
      evidenceLiteralMatch: evidenceResult?.verdict === "valid" ? true : diagnostic.evidenceLiteralMatch,
      attributionId,
      evidenceVerdict
    })}`);
  }
}

function resolveAttributionVerdict(
  handle: AttributionVerdictHandle,
  evidenceResults: Map<string, AttributionEvidenceResult>
): AttributionEvidenceVerdict {
  if (handle.kind === "direct") {
    return handle.verdict;
  }

  return evidenceResults.get(handle.key)?.verdict ?? "uncertain";
}

function buildRestoredSafeCandidate(
  sourceDish: MainDishAIAnalyzedDish | undefined,
  fallbackNameOriginal: string
): MainDishAISafeCandidate {
  return {
    nameOriginal: sourceDish?.nameOriginal ?? fallbackNameOriginal,
    descriptionOriginal: sourceDish?.descriptionOriginal ?? null,
    scoreReason: "Main-AI-Entfernung ohne belastbare Profil-Attribution; Kandidat wird dem Safety-Pfad zugefuehrt.",
    priceRaw: sourceDish?.price ?? null,
    sourceEvidence: buildRestoredSourceEvidence(sourceDish, fallbackNameOriginal),
    confidence: "medium",
    profileSafety: {
      hasKnownConflict: false,
      uncertainForAllergy: false,
      conflictReason: null
    }
  };
}

function buildRestoredSourceEvidence(sourceDish: MainDishAIAnalyzedDish | undefined, fallbackNameOriginal: string) {
  return [
    sourceDish?.nameOriginal ?? fallbackNameOriginal,
    sourceDish?.descriptionOriginal ?? null
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}

function neutralizeRecommendationPayload(
  payload: NonNullable<MainDishAISafeCandidate["recommendationPayload"]>,
  outputLocale: string | undefined
): NonNullable<MainDishAISafeCandidate["recommendationPayload"]> {
  return {
    ...payload,
    matchedPreferenceValue: null,
    profileEvidence: null,
    evidenceSource: null,
    reason: buildNeutralPreferenceReason(outputLocale)
  };
}

function neutralizeRecommendation(
  recommendation: MainDishAIRecommendation,
  outputLocale: string | undefined
): MainDishAIRecommendation {
  return {
    ...recommendation,
    matchedPreferenceValue: null,
    profileEvidence: null,
    evidenceSource: null,
    reason: buildNeutralPreferenceReason(outputLocale)
  };
}

function getCanonicalCandidateSource(
  candidate: MainDishAISafeCandidate,
  allDishesByName: Map<string, MainDishAIAnalyzedDish>
) {
  const sourceDish = allDishesByName.get(normalizeAttributionText(candidate.nameOriginal));

  return {
    nameOriginal: firstNonBlank(candidate.nameOriginal, sourceDish?.nameOriginal) ?? "",
    descriptionOriginal: firstNonBlank(candidate.descriptionOriginal, sourceDish?.descriptionOriginal) ?? null
  };
}

function getCanonicalRecommendationSource(
  recommendation: MainDishAIRecommendation,
  safeCandidatesByName: Map<string, MainDishAISafeCandidate>,
  allDishesByName: Map<string, MainDishAIAnalyzedDish>
) {
  const key = normalizeAttributionText(recommendation.nameOriginal);
  const safeCandidate = key ? safeCandidatesByName.get(key) : undefined;

  if (safeCandidate) {
    return getCanonicalCandidateSource(safeCandidate, allDishesByName);
  }

  const sourceDish = key ? allDishesByName.get(key) : undefined;

  if (sourceDish) {
    return {
      nameOriginal: firstNonBlank(sourceDish.nameOriginal) ?? "",
      descriptionOriginal: firstNonBlank(sourceDish.descriptionOriginal) ?? null
    };
  }

  return {
    nameOriginal: firstNonBlank(recommendation.nameOriginal) ?? "",
    descriptionOriginal: firstNonBlank(recommendation.descriptionOriginal) ?? null
  };
}

function firstNonBlank(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function findActiveProfileValue(value: string | null | undefined, activeProfileValues: string[]) {
  const normalized = normalizeAttributionText(value ?? "");
  if (!normalized) return null;

  return activeProfileValues.find((item) => normalizeAttributionText(item) === normalized) ?? null;
}

function containsVisibleEvidence(sourceText: string, evidence: string) {
  return normalizeAttributionText(sourceText).includes(normalizeAttributionText(evidence));
}

function findDirectVisibleEvidence({
  profileValue,
  nameOriginal,
  descriptionOriginal
}: {
  profileValue: string;
  nameOriginal: string;
  descriptionOriginal?: string | null;
}): { profileEvidence: string; evidenceSource: EvidenceSource } | null {
  const evidence = stripNegationPrefix(profileValue).trim();

  if (!evidence) {
    return null;
  }

  if (containsVisibleEvidence(nameOriginal, evidence)) {
    return {
      profileEvidence: evidence,
      evidenceSource: "name"
    };
  }

  if (descriptionOriginal && containsVisibleEvidence(descriptionOriginal, evidence)) {
    return {
      profileEvidence: evidence,
      evidenceSource: "description"
    };
  }

  return null;
}

function buildAttributionKey(
  profileType: AttributionEvidenceProfileType,
  profileValue: string,
  nameOriginal: string,
  descriptionOriginal?: string | null
) {
  return [
    profileType,
    normalizeAttributionText(profileValue),
    normalizeAttributionText(nameOriginal),
    normalizeAttributionText(descriptionOriginal ?? "")
  ].join("|");
}

function buildDeterministicPreferenceReason(value: string | null | undefined, outputLocale: string | undefined) {
  const preferenceValue = value?.trim() ?? "active preference";

  if (outputLocale?.toLowerCase().startsWith("en")) {
    return `Matches your preference: ${preferenceValue}.`;
  }

  return `Passt zu Deiner Vorliebe: ${preferenceValue}.`;
}

function buildNeutralPreferenceReason(outputLocale: string | undefined) {
  if (outputLocale?.toLowerCase().startsWith("en")) {
    return "Selected without a confirmed match to your preferences.";
  }

  return "Ausgewählt ohne bestätigten Bezug zu Deinen Vorlieben.";
}

function stripNegationPrefix(value: string) {
  return value.replace(/^(?:kein|keine|keinen|keinem|keiner|ohne|nicht|no|without)\s+/i, "").trim();
}

function arrayValue(values?: string[]) {
  return Array.isArray(values) ? values.filter((value) => value.trim().length > 0) : [];
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeAttributionText(item) === normalizeAttributionText(value)) ? result : [...result, value];
  }, []);
}

function normalizeAttributionText(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ü/g, "ue")
    .replace(/ö/g, "oe")
    .replace(/ä/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
