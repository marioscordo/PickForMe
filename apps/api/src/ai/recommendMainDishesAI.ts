import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { Situation, UserProfile } from "../types/profile";
import type { PreferredDishRole, RequestedDishRole } from "../types/api";
import {
  buildTwoStepSourceContent,
  createTwoStepOpenAIClient,
  getLanguageNameForLocale,
  getTwoStepSourceContentDiagnostics,
  getTwoStepModelForSource,
  normalizeTargetLocale,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import {
  isAnalyzeDiagnosticsEnabled,
  logAnalyzeOpsDiagnostic
} from "./twoStepRecommendationDiagnostics";
import {
  MainDishAICompactResponseSchema,
  MainDishAIResponseSchema,
  type MainDishAICompactDish,
  type MainDishAIAnalyzedDish,
  type MainDishAIRecommendation,
  type MainDishAIRemovedDish,
  type MainDishAIResultSummary,
  type MainDishAISafeCandidate,
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";
import { verifyRecommendationSafetyAI } from "./verifyRecommendationSafetyAI";
import {
  buildRecommendationSafetyRestrictions,
  candidateContainsEvidence,
  filterSafeRecommendationCandidates
} from "../recommendation/recommendationSafetyVerifier";
import { validateMainDishAttributions } from "../recommendation/attributionValidator";

export type MainDishRecommendationResult = {
  recommendations: MainDishAIRecommendation[];
  uncertainReviewCandidates: MainDishAISafeCandidate[];
  productionTrace?: {
    mainCandidateCount: number;
    restrictionCount: number;
    safeCount: number;
    uncertainCount: number;
    conflictCount: number;
    invalidCount: number;
  };
};

type MainDishAIWorkingResponse = ReturnType<typeof MainDishAIResponseSchema.parse> & {
  uncertainReviewCandidates?: MainDishAISafeCandidate[];
  productionTrace?: MainDishRecommendationResult["productionTrace"];
};

type MainDishAiDiagnosticRow = {
  index: number;
  nameOriginal: string;
  translatedNamePresent?: boolean;
  translatedName?: string;
  descriptionOriginalPresent?: boolean;
  translatedDescriptionPresent?: boolean;
  detectedConflicts?: string[];
  isSafe?: boolean;
  matchedProfileValue?: string;
  profileSafetyHasKnownConflict?: boolean;
  profileSafetyUncertainForAllergy?: boolean;
  profileSafetyConflictReason?: string | null;
  reason?: string;
  candidateScoreReason?: string;
  finalRecommendationReason?: string;
  inAllDishes: boolean;
  inRemovedDishes: boolean;
  inSafeCandidates: boolean;
  inRecommendations: boolean;
};

export async function recommendMainDishesAI({
  source,
  profile,
  situation,
  requestedDishRoles,
  preferredDishRole,
  userLocale,
  runId,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation?: Situation;
  requestedDishRoles?: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  userLocale?: string;
  runId?: string;
  signal?: AbortSignal;
}): Promise<MainDishRecommendationResult> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const model = getTwoStepModelForSource(source);
  const sourceContent = buildTwoStepSourceContent({
    prompt: buildMainDishPrompt({
      profile,
      situation,
      requestedDishRoles,
      preferredDishRole,
      targetLocale,
      targetLanguage,
      source
    }),
    source
  });
  const contentDiagnostics = getTwoStepSourceContentDiagnostics(source, sourceContent);
  const request: ResponseCreateParamsNonStreaming = {
    model,
    input: [
      {
        role: "user",
        content: sourceContent
      }
    ]
  };

  let parsed: MainDishAIWorkingResponse | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const requestStartedAt = Date.now();
    const response = await client.responses.create(request, signal ? { signal } : undefined)
      .catch((error) => {
        logDevAnalyzeTiming({
          runId,
          phase: "api.main_ai_request",
          durationMs: Date.now() - requestStartedAt,
          model,
          retryAttempt: attempt,
          sdkRetries: "not_exposed",
          ...contentDiagnostics,
          success: false,
          errorClass: error instanceof Error ? error.name : typeof error
        });
        throw error;
      });
    logDevAnalyzeTiming({
      runId,
      phase: "api.main_ai_request",
      durationMs: Date.now() - requestStartedAt,
      model,
      retryAttempt: attempt,
      sdkRetries: "not_exposed",
      ...contentDiagnostics,
      inputTokens: getUsageValue(response.usage, "input_tokens"),
      outputTokens: getUsageValue(response.usage, "output_tokens"),
      success: true
    });

    const parseStartedAt = Date.now();

    try {
      const compactJson = limitUploadedBase64ImageCompactDishes(JSON.parse(stripJsonFence(response.output_text ?? "{}")), source);
      const compactParsed = MainDishAICompactResponseSchema.parse(compactJson);
      normalizeMissingCompactTranslatedDescriptions(compactParsed, targetLocale);
      validateCompactDescriptionTranslationContract(compactParsed);
      parsed = buildMainDishResponseFromCompactDishes({
        dishes: compactParsed.dishes,
        source,
        outputLocale: profile.outputLocale
      });
      logAnalyzeOpsDiagnostic({
        runId,
        phase: "main_ai_parse",
        durationMs: Date.now() - parseStartedAt,
        sourceKind: source.kind,
        requestedDishRoles: formatRequestedDishRolesForOps(requestedDishRoles),
        preferredDishRole,
        requestKind: getAnalyzeRequestKind(requestedDishRoles, preferredDishRole),
        candidateCount: parsed.safeCandidates.length,
        recommendationCount: parsed.recommendations.length
      });
      const verifierSafe = await applyMainDishVerifierSafety(parsed, profile, runId, signal);
      const uncertainReviewCandidates = verifierSafe.uncertainReviewCandidates ?? [];
      const attributionValidated = await validateMainDishAttributions(verifierSafe, profile, runId, signal);
      parsed = {
        ...attributionValidated,
        uncertainReviewCandidates,
        productionTrace: verifierSafe.productionTrace
      };
      parsed.recommendations = backfillMainDishRecommendationsWithValidatedCandidates({
        recommendations: parsed.recommendations,
        safeCandidates: parsed.safeCandidates
      });
      parsed.recommendations = rankRecommendationsByPreferenceAttribution(parsed.recommendations);
      parsed.resultSummary = {
        ...parsed.resultSummary,
        recommendationCount: parsed.recommendations.length,
        lessThanThreeReason: parsed.recommendations.length < 3
          ? parsed.resultSummary.lessThanThreeReason
          : null
      };
      logDevAnalyzeTiming({
        runId,
        phase: "api.main_ai_parse",
        durationMs: Date.now() - parseStartedAt,
        retryAttempt: attempt,
        candidateCount: parsed.safeCandidates.length,
        success: true
      });
      break;
    } catch (error) {
      logDevAnalyzeTiming({
        runId,
        phase: "api.main_ai_parse",
        durationMs: Date.now() - parseStartedAt,
        retryAttempt: attempt,
        success: false,
        errorClass: error instanceof Error ? error.name : typeof error
      });
      logAnalyzeOpsDiagnostic({
        runId,
        phase: error instanceof Error && error.message.includes("ATTRIBUTION_NOT_CONFIRMED")
          ? "attribution_evidence"
          : "main_ai_parse",
        durationMs: Date.now() - parseStartedAt,
        sourceKind: source.kind,
        requestedDishRoles: formatRequestedDishRolesForOps(requestedDishRoles),
        preferredDishRole,
        requestKind: getAnalyzeRequestKind(requestedDishRoles, preferredDishRole),
        errorClass: getAnalyzeOpsErrorClass(error),
        diagnosticReason: getAnalyzeOpsDiagnosticReason(error)
      });

      if (attempt === 1 && isInvalidAiResponseError(error)) {
        continue;
      }

      throw toSyntaxError(error);
    }
  }

  if (!parsed) {
    throw new SyntaxError("AI_RESPONSE_INVALID");
  }

  logMainDishAiResponseDiagnostic(parsed, runId);

  return {
    recommendations: parsed.recommendations,
    uncertainReviewCandidates: parsed.uncertainReviewCandidates ?? [],
    productionTrace: parsed.productionTrace
  };
}

function normalizeMissingCompactTranslatedDescriptions(
  response: ReturnType<typeof MainDishAICompactResponseSchema.parse>,
  targetLocale: string
) {
  for (const item of response.dishes) {
    const descriptionOriginal = item.descriptionOriginal?.trim();
    const translatedDescription = item.translatedDescription?.trim();

    if (
      descriptionOriginal &&
      !translatedDescription &&
      !isDescriptionLikelyInTargetLanguage(descriptionOriginal, targetLocale)
    ) {
      item.translatedDescription = null;
    }
  }
}

function validateCompactDescriptionTranslationContract(
  response: ReturnType<typeof MainDishAICompactResponseSchema.parse>,
) {
  for (const item of response.dishes) {
    const descriptionOriginal = item.descriptionOriginal?.trim();
    const translatedDescription = item.translatedDescription?.trim();

    if (!descriptionOriginal && translatedDescription) {
      throw new SyntaxError("AI_RESPONSE_INVALID_DESCRIPTION_WITHOUT_SOURCE");
    }
  }
}

function buildMainDishResponseFromCompactDishes({
  dishes,
  source,
  outputLocale
}: {
  dishes: MainDishAICompactDish[];
  source: TwoStepMenuSourceInput;
  outputLocale?: string;
}): ReturnType<typeof MainDishAIResponseSchema.parse> {
  const neutralReason = buildBackendNeutralReason(outputLocale);
  const sourceUrl = normalizedNullableString(source.sourceUrl);
  const candidates = dishes.map((dish): MainDishAISafeCandidate => {
    const sourceKind = dish.sourceKind ?? source.kind;

    return {
      nameOriginal: dish.nameOriginal,
      descriptionOriginal: dish.descriptionOriginal,
      scoreReason: neutralReason,
      translatedName: dish.translatedName,
      translatedDescription: dish.translatedDescription,
      priceRaw: dish.priceRaw,
      sourceEvidence: dish.sourceEvidence,
      sourceKind,
      sourceUrl: normalizedNullableString(dish.sourceUrl) ?? sourceUrl,
      sourceCategoryOriginal: dish.sourceCategoryOriginal,
      matchedPreferenceValue: dish.matchedPreferenceValue,
      profileEvidence: null,
      evidenceSource: null,
      confidence: "medium",
      profileSafety: buildBackendSafeProfileSafety(),
      recommendationPayload: {
        nameOriginal: dish.nameOriginal,
        translatedName: dish.translatedName,
        descriptionOriginal: dish.descriptionOriginal,
        translatedDescription: dish.translatedDescription,
        priceRaw: dish.priceRaw,
        sourceEvidence: dish.sourceEvidence,
        sourceKind,
        sourceUrl: normalizedNullableString(dish.sourceUrl) ?? sourceUrl,
        sourceCategoryOriginal: dish.sourceCategoryOriginal,
        matchedPreferenceValue: dish.matchedPreferenceValue,
        profileEvidence: null,
        evidenceSource: null,
        reason: neutralReason,
        confidence: "medium",
        profileSafety: buildBackendSafeProfileSafety()
      }
    };
  });

  return MainDishAIResponseSchema.parse({
    allDishes: dishes.map((dish) => ({
      nameOriginal: dish.nameOriginal,
      descriptionOriginal: dish.descriptionOriginal,
      price: dish.priceRaw,
      detectedConflicts: [],
      isSafe: true
    })),
    removedDishes: [],
    safeCandidates: candidates,
    recommendations: [],
    resultSummary: {
      allDishCount: dishes.length,
      removedDishCount: 0,
      safeCandidateCount: candidates.length,
      recommendationCount: 0,
      lessThanThreeReason: candidates.length < 3
        ? "Weniger als drei Kandidaten im angeforderten Rollenraum erkannt."
        : null
    }
  });
}

function buildBackendSafeProfileSafety() {
  return {
    hasKnownConflict: false,
    uncertainForAllergy: false,
    conflictReason: null
  };
}

function buildBackendNeutralReason(outputLocale: string | undefined) {
  return outputLocale?.toLowerCase().startsWith("en")
    ? "Selected without a confirmed match to your preferences."
    : "Ausgewählt ohne bestätigten Bezug zu Deinen Vorlieben.";
}

function normalizedNullableString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isDescriptionLikelyInTargetLanguage(value: string, targetLocale: string) {
  const targetLanguage = targetLocale.split("-")[0]?.toLowerCase();

  if (targetLanguage === "de") {
    return looksLikeGermanText(value);
  }

  if (targetLanguage === "en") {
    return looksLikeEnglishText(value);
  }

  return false;
}

function looksLikeGermanText(value: string) {
  const normalized = value.toLowerCase();
  return /[äöüß]/.test(normalized) ||
    /\b(?:und|mit|auf|aus|vom|von|der|die|das|eine|einer|frisch|hausgemacht)\b/.test(normalized);
}

function looksLikeEnglishText(value: string) {
  const normalized = value.toLowerCase();
  return /\b(?:and|with|from|served|fresh|homemade|grilled|roasted|sauce|salad|cheese)\b/.test(normalized);
}

function isInvalidAiResponseError(error: unknown) {
  return error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError");
}

function toSyntaxError(error: unknown) {
  if (error instanceof SyntaxError) {
    return error;
  }

  if (error instanceof Error && error.name === "ZodError") {
    return new SyntaxError("AI_RESPONSE_INVALID_SCHEMA");
  }

  return error;
}

function limitUploadedBase64ImageCompactDishes(value: unknown, source: TwoStepMenuSourceInput) {
  if (!isUploadedBase64ImageSource(source) || value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const response = value as { dishes?: unknown };
  if (!Array.isArray(response.dishes) || response.dishes.length <= 10) {
    return value;
  }

  return {
    ...(value as Record<string, unknown>),
    dishes: response.dishes.slice(0, 10)
  };
}

function isUploadedBase64ImageSource(source: TwoStepMenuSourceInput) {
  return source.kind === "image" &&
    !source.sourceUrl &&
    (source.urls ?? []).some((url) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(url));
}

function logMainDishAiResponseDiagnostic(
  response: {
    allDishes: MainDishAIAnalyzedDish[];
    removedDishes: MainDishAIRemovedDish[];
    safeCandidates: MainDishAISafeCandidate[];
    recommendations: MainDishAIRecommendation[];
    resultSummary: MainDishAIResultSummary;
    uncertainReviewCandidates?: MainDishAISafeCandidate[];
  },
  runId?: string
) {
  if (!isAnalyzeDiagnosticsEnabled()) {
    return;
  }

  const rows = new Map<string, MainDishAiDiagnosticRow>();

  const getRow = (nameOriginal: string) => {
    const key = normalizeDiagnosticName(nameOriginal);
    const existing = rows.get(key);
    if (existing) return existing;

    const row: MainDishAiDiagnosticRow = {
      index: rows.size + 1,
      nameOriginal: truncateDiagnosticValue(nameOriginal),
      inAllDishes: false,
      inRemovedDishes: false,
      inSafeCandidates: false,
      inRecommendations: false
    };
    rows.set(key, row);
    return row;
  };

  response.allDishes.forEach((dish) => {
    const row = getRow(dish.nameOriginal);
    row.inAllDishes = true;
    row.descriptionOriginalPresent = hasDiagnosticValue(dish.descriptionOriginal);
    row.detectedConflicts = dish.detectedConflicts.map(truncateDiagnosticValue);
    row.isSafe = dish.isSafe;
  });

  response.removedDishes.forEach((dish) => {
    const row = getRow(dish.nameOriginal);
    row.inRemovedDishes = true;
    row.matchedProfileValue = truncateDiagnosticValue(dish.matchedProfileValue);
    row.reason = truncateDiagnosticValue(dish.reason);
  });

  response.safeCandidates.forEach((candidate) => {
    const row = getRow(candidate.nameOriginal);
    row.inSafeCandidates = true;
    row.descriptionOriginalPresent = row.descriptionOriginalPresent ?? hasDiagnosticValue(candidate.descriptionOriginal);
    row.candidateScoreReason = truncateDiagnosticValue(candidate.scoreReason);
    row.reason = row.reason ?? truncateDiagnosticValue(candidate.scoreReason);
  });

  response.recommendations.forEach((recommendation) => {
    const row = getRow(recommendation.nameOriginal);
    row.inRecommendations = true;
    row.translatedNamePresent = hasDiagnosticValue(recommendation.translatedName);
    row.translatedName = truncateDiagnosticValue(recommendation.translatedName);
    row.descriptionOriginalPresent = row.descriptionOriginalPresent ?? hasDiagnosticValue(recommendation.descriptionOriginal);
    row.translatedDescriptionPresent = hasDiagnosticValue(recommendation.translatedDescription);
    row.profileSafetyHasKnownConflict = recommendation.profileSafety.hasKnownConflict;
    row.profileSafetyUncertainForAllergy = recommendation.profileSafety.uncertainForAllergy;
    row.profileSafetyConflictReason = recommendation.profileSafety.conflictReason
      ? truncateDiagnosticValue(recommendation.profileSafety.conflictReason)
      : null;
    row.finalRecommendationReason = truncateDiagnosticValue(recommendation.reason);
    row.reason = row.finalRecommendationReason;
  });

  console.info(`[GUSTARO_2STEP_MAIN_DIAG] ${JSON.stringify({
    runId,
    resultSummary: response.resultSummary,
    rows: Array.from(rows.values())
  })}`);
}

async function applyMainDishVerifierSafety(
  response: {
    allDishes: MainDishAIAnalyzedDish[];
    removedDishes: MainDishAIRemovedDish[];
    safeCandidates: MainDishAISafeCandidate[];
    recommendations: MainDishAIRecommendation[];
    resultSummary: MainDishAIResultSummary;
  },
  profile: UserProfile,
  runId?: string,
  signal?: AbortSignal
) {
  const restrictions = buildRecommendationSafetyRestrictions(profile);

  if (restrictions.length === 0 || response.safeCandidates.length === 0) {
    const productionTrace = buildProductionSafetyTrace({
      mainCandidateCount: response.safeCandidates.length,
      restrictionCount: restrictions.length,
      validation: response.safeCandidates.map((candidate, index) => ({
        candidateId: `candidate_${index}`,
        safe: true as const
      }))
    });

    logDevAnalyzeTiming({
      runId,
      phase: "api.safety_verifier_request",
      durationMs: 0,
      candidateCount: response.safeCandidates.length,
      restrictionCount: restrictions.length,
      success: true
    });
    logAnalyzeOpsDiagnostic({
      runId,
      phase: "safety_verifier",
      durationMs: 0,
      candidateCount: response.safeCandidates.length,
      recommendationCount: response.recommendations.length
    });
    return {
      ...response,
      uncertainReviewCandidates: [],
      productionTrace
    };
  }

  const candidates = response.safeCandidates.map((candidate, index) => ({
    ...candidate,
    id: `candidate_${index}`
  }));
  const verifierCandidates = candidates.map((candidate) => ({
    id: candidate.id,
    nameOriginal: candidate.nameOriginal,
    descriptionOriginal: candidate.descriptionOriginal
  }));
  const verifierStartedAt = Date.now();
  const verifierResponse = await verifyRecommendationSafetyAI({
    restrictions,
    candidates: verifierCandidates,
    runId,
    signal
  }).catch(() => ({ candidates: [] }));
  logDevAnalyzeTiming({
    runId,
    phase: "api.safety_verifier_request",
    durationMs: Date.now() - verifierStartedAt,
    candidateCount: verifierCandidates.length,
    restrictionCount: restrictions.length,
    sdkRetries: "not_exposed",
    success: true
  });

  const validationStartedAt = Date.now();
  const verifierResult = filterSafeRecommendationCandidates({
    restrictions,
    candidates,
    response: verifierResponse
  });
  const productionTrace = buildProductionSafetyTrace({
    mainCandidateCount: response.safeCandidates.length,
    restrictionCount: restrictions.length,
    validation: verifierResult.validation
  });
  logVerifierDecisionDiagnostics({
    restrictions,
    candidates,
    response: verifierResponse,
    validation: verifierResult.validation,
    runId
  });
  logDevAnalyzeTiming({
    runId,
    phase: "api.safety_verifier_validation",
    durationMs: Date.now() - validationStartedAt,
    candidateCount: candidates.length,
    restrictionCount: restrictions.length,
    success: true
  });
  logAnalyzeOpsDiagnostic({
    runId,
    phase: "safety_verifier",
    durationMs: Date.now() - verifierStartedAt,
    candidateCount: candidates.length,
    recommendationCount: verifierResult.candidates.length,
    diagnosticReason: verifierResult.candidates.length === 0 ? "safety_removed_all" : undefined
  });
  const safeCandidates = verifierResult.candidates.map(({ id: _id, ...candidate }) => candidate);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const uncertainReviewCandidates = verifierResult.validation
    .filter((result) => result.reason === "uncertain")
    .map((result) => candidatesById.get(result.candidateId))
    .filter((candidate): candidate is MainDishAISafeCandidate & { id: string } => Boolean(candidate))
    .map(({ id: _id, ...candidate }) => candidate);

  if (safeCandidates.length === response.safeCandidates.length) {
    return {
      ...response,
      uncertainReviewCandidates,
      productionTrace
    };
  }

  const rebuildStartedAt = Date.now();
  const recommendations = rebuildMainDishRecommendationsFromSafeCandidates({
    safeCandidates
  });
  logDevAnalyzeTiming({
    runId,
    phase: "api.candidate_filter_and_rebuild",
    durationMs: Date.now() - rebuildStartedAt,
    candidateCount: safeCandidates.length,
    success: true
  });

  return {
    ...response,
    removedDishes: [
      ...response.removedDishes,
      ...verifierResult.validation
        .filter((result) => !result.safe)
        .map((result): MainDishAIRemovedDish => ({
          nameOriginal: candidates.find((candidate) => candidate.id === result.candidateId)?.nameOriginal ?? result.candidateId,
          matchedProfileValue: "Safety-Verifier",
          reason: "Nicht ausreichend sicher verifiziert."
        }))
    ],
    safeCandidates,
    uncertainReviewCandidates,
    productionTrace,
    recommendations,
    resultSummary: {
      ...response.resultSummary,
      removedDishCount: response.resultSummary.removedDishCount + verifierResult.validation.filter((result) => !result.safe).length,
      safeCandidateCount: safeCandidates.length,
      recommendationCount: recommendations.length,
      lessThanThreeReason: recommendations.length < 3
        ? response.resultSummary.lessThanThreeReason ?? "Weniger als drei sichere Kandidaten nach Safety-Verifier-Pruefung."
        : null
    }
  };
}

function buildProductionSafetyTrace({
  mainCandidateCount,
  restrictionCount,
  validation
}: {
  mainCandidateCount: number;
  restrictionCount: number;
  validation: Array<{ safe: boolean; reason?: "invalid_response" | "conflict" | "uncertain" }>;
}) {
  return {
    mainCandidateCount,
    restrictionCount,
    safeCount: validation.filter((result) => result.safe).length,
    uncertainCount: validation.filter((result) => result.reason === "uncertain").length,
    conflictCount: validation.filter((result) => result.reason === "conflict").length,
    invalidCount: validation.filter((result) => result.reason === "invalid_response").length
  };
}

function rebuildMainDishRecommendationsFromSafeCandidates({
  safeCandidates
}: {
  safeCandidates: MainDishAISafeCandidate[];
}): MainDishAIRecommendation[] {
  const nextRecommendations: MainDishAIRecommendation[] = [];

  for (const candidate of safeCandidates) {
    const recommendation = buildRecommendationFromSafeCandidate(candidate);

    if (!recommendation) {
      continue;
    }

    nextRecommendations.push({
      ...recommendation,
      rank: nextRecommendations.length + 1
    });

    if (nextRecommendations.length >= 3) {
      break;
    }
  }

  return nextRecommendations;
}

function backfillMainDishRecommendationsWithValidatedCandidates({
  recommendations,
  safeCandidates
}: {
  recommendations: MainDishAIRecommendation[];
  safeCandidates: MainDishAISafeCandidate[];
}) {
  const nextRecommendations = [...recommendations];
  const recommendedNames = new Set(recommendations.map((recommendation) => normalizeDiagnosticName(recommendation.nameOriginal)));

  for (const candidate of safeCandidates) {
    if (nextRecommendations.length >= 3) {
      break;
    }

    const nameKey = normalizeDiagnosticName(candidate.nameOriginal);

    if (recommendedNames.has(nameKey)) {
      continue;
    }

    const recommendation = buildRecommendationFromSafeCandidate(candidate);

    if (!recommendation) {
      continue;
    }

    nextRecommendations.push({
      ...recommendation,
      rank: nextRecommendations.length + 1
    });
    recommendedNames.add(nameKey);
  }

  return nextRecommendations.map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1
  }));
}

function buildRecommendationFromSafeCandidate(candidate: MainDishAISafeCandidate): MainDishAIRecommendation | null {
  const payload = candidate.recommendationPayload;

  if (
    !payload?.nameOriginal?.trim() ||
    !payload.translatedName?.trim() ||
    !payload.reason?.trim() ||
    !payload.confidence ||
    !payload.profileSafety
  ) {
    return null;
  }

  return {
    rank: 0,
    nameOriginal: payload.nameOriginal,
    translatedName: payload.translatedName,
    descriptionOriginal: payload.descriptionOriginal,
    translatedDescription: payload.translatedDescription,
    priceRaw: payload.priceRaw ?? candidate.priceRaw,
    sourceEvidence: payload.sourceEvidence,
    sourceKind: payload.sourceKind,
    sourceUrl: payload.sourceUrl,
    sourceCategoryOriginal: payload.sourceCategoryOriginal,
    matchedPreferenceValue: payload.matchedPreferenceValue,
    profileEvidence: payload.profileEvidence,
    evidenceSource: payload.evidenceSource,
    reason: payload.reason,
    confidence: payload.confidence,
    profileSafety: payload.profileSafety
  };
}

function rankRecommendationsByPreferenceAttribution(recommendations: MainDishAIRecommendation[]) {
  return recommendations
    .map((recommendation, index) => ({ recommendation, index }))
    .sort((left, right) => {
      const leftHasPreference = Boolean(left.recommendation.matchedPreferenceValue?.trim());
      const rightHasPreference = Boolean(right.recommendation.matchedPreferenceValue?.trim());

      if (leftHasPreference !== rightHasPreference) {
        return leftHasPreference ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map(({ recommendation }, index) => ({
      ...recommendation,
      rank: index + 1
    }));
}

function logVerifierDecisionDiagnostics({
  restrictions,
  candidates,
  response,
  validation,
  runId
}: {
  restrictions: ReturnType<typeof buildRecommendationSafetyRestrictions>;
  candidates: Array<MainDishAISafeCandidate & { id: string }>;
  response: { candidates?: Array<{ candidateId?: string; checks?: Array<{ restrictionId?: string; verdict?: string; evidence?: string | null; source?: string | null }> }> };
  validation: Array<{ candidateId: string; safe: boolean; reason?: string }>;
  runId?: string;
}) {
  if (!isAnalyzeDiagnosticsEnabled()) {
    return;
  }

  const responseByCandidateId = new Map<string, NonNullable<typeof response.candidates>[number]>();
  for (const candidate of Array.isArray(response.candidates) ? response.candidates : []) {
    const candidateId = candidate.candidateId?.trim();

    if (candidateId) {
      responseByCandidateId.set(candidateId, candidate);
    }
  }

  const validationByCandidateId = new Map(validation.map((result) => [result.candidateId, result]));

  for (const candidate of candidates) {
    const responseCandidate = responseByCandidateId.get(candidate.id);
    const checksByRestrictionId = new Map<string, NonNullable<NonNullable<typeof response.candidates>[number]["checks"]>[number]>();
    for (const check of Array.isArray(responseCandidate?.checks) ? responseCandidate.checks : []) {
      const restrictionId = check.restrictionId?.trim();

      if (restrictionId) {
        checksByRestrictionId.set(restrictionId, check);
      }
    }

    const validationResult = validationByCandidateId.get(candidate.id);

    for (const restriction of restrictions) {
      const check = checksByRestrictionId.get(restriction.id);
      const evidence = check?.evidence?.trim() ?? "";
      const source = check?.source === "name" || check?.source === "description" ? check.source : null;
      const evidenceValid = check?.verdict === "conflict"
        ? Boolean(evidence && source && candidateContainsEvidence(candidate, evidence, source))
        : undefined;

      console.info(`[GUSTARO_SAFETY_VERIFIER_DECISION] ${[
        `runId=${runId ?? ""}`,
        `candidateId=${candidate.id}`,
        `candidateName=${candidate.nameOriginal.replace(/\s+/g, "_")}`,
        `restrictionId=${restriction.id}`,
        `restrictionType=${restriction.type}`,
        `restrictionLabel=${restriction.label.replace(/\s+/g, "_")}`,
        `verdict=${check?.verdict ?? "missing"}`,
        `reason=${validationResult?.reason ?? "safe"}`,
        evidenceValid === undefined ? null : `evidenceValid=${evidenceValid}`,
        evidence ? `evidence=${evidence.replace(/\s+/g, "_")}` : null,
        source ? `source=${source}` : null
      ].filter(Boolean).join(" ")}`);
    }
  }
}

function hasDiagnosticValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function truncateDiagnosticValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function normalizeDiagnosticName(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

type DevTimingValue = string | number | boolean | null | undefined;

function logDevAnalyzeTiming(fields: Record<string, DevTimingValue>) {
  if (!isAnalyzeDiagnosticsEnabled()) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_DEV_ANALYZE_TIMING] ${payload}`);
}

function getUsageValue(usage: unknown, key: "input_tokens" | "output_tokens") {
  if (!usage || typeof usage !== "object" || !(key in usage)) {
    return undefined;
  }

  const value = (usage as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function formatRequestedDishRolesForOps(roles: RequestedDishRole[] | undefined) {
  return roles?.length ? roles.join(",") : "main";
}

function getAnalyzeRequestKind(
  roles: RequestedDishRole[] | undefined,
  preferredDishRole: PreferredDishRole | undefined
) {
  return preferredDishRole === "starter" && (roles ?? []).includes("starter") ? "embedded" : "topLevel";
}

function getAnalyzeOpsErrorClass(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/timeout/i.test(message)) return "timeout";
  if (/abort/i.test(message) || error instanceof DOMException && error.name === "AbortError") return "abort";
  if (/fetch failed|connection|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(message)) return "connection";
  if (/AI_RESPONSE_INVALID|SyntaxError|JSON/i.test(message) || error instanceof SyntaxError) return "invalid-response";
  return undefined;
}

function getAnalyzeOpsDiagnosticReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("ATTRIBUTION_NOT_CONFIRMED:")) {
    return message.split("ATTRIBUTION_NOT_CONFIRMED:")[1]?.trim() || "no_valid_attribution_after_backfill";
  }

  if (message.includes("ATTRIBUTION_EVIDENCE_TIMEOUT")) return "attribution_evidence_timeout";
  if (message.includes("ATTRIBUTION_EVIDENCE_TECHNICAL_ERROR")) return "attribution_evidence_technical_error";
  if (message.includes("TWO_STEP_MAIN_AI_TIMEOUT")) return "main_ai_timeout";
  if (message.includes("AI_RESPONSE_INVALID")) return "invalid_response";
  return undefined;
}

function buildMainDishPrompt({
  profile,
  situation,
  requestedDishRoles,
  preferredDishRole,
  targetLocale,
  targetLanguage,
  source
}: {
  profile: UserProfile;
  situation?: Situation;
  requestedDishRoles?: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  targetLocale: string;
  targetLanguage: string;
  source: TwoStepMenuSourceInput;
}) {
  const roleAssignment = buildRequestedDishRoleAssignment(requestedDishRoles);
  const rolePreferenceAssignment = buildPreferredDishRoleAssignment(preferredDishRole, roleAssignment);
  const activePreferences = getActivePreferenceValues(profile);
  const searchAssignment = buildActivePreferenceSearchAssignment(activePreferences);
  const pdfFileFallbackRules = buildPdfFileFallbackRules(source, activePreferences);
  const structuredAssignment = buildStructuredMainDishAssignment({
    profile,
    situation,
    roleAssignment,
    activePreferences,
    searchAssignment,
    targetLocale
  });

  return [
    "Du bist GustaroAI in der neuen 2+2-AI-Architektur.",
    "Du bist der Main-AI-Concierge fuer rollenbasierte Speisekartenempfehlungen.",
    "Du bekommst Profil, Gerichtsrollen, Regeln und Speisekarte vollstaendig strukturiert.",
    `Liefere jeden klar erkennbaren Kandidaten aus diesem Rollenraum genau einmal: ${roleAssignment.label}.`,
    "- Liefere bis zu 10 unterschiedliche Gerichte aus dem angeforderten Rollenraum.",
    "- Wenn weniger als 10 rollenpassende Gerichte vorhanden sind, liefere alle geeigneten.",
    "- Erfinde keine kuenstliche Mindestanzahl.",
    `Aufgabe: Erzeuge einen entdoppelten Kandidatenpool aus ${roleAssignment.label}; Backend-Safety, Vorliebengewichtung, Backfill und finale Auswahl passieren danach.`,
    "Arbeite in dieser Reihenfolge:",
    "1. Analysiere die Speisekarte.",
    `2. Ermittle alle verfuegbaren ${roleAssignment.analysisTarget} mit Gerichtsname und vollstaendiger sichtbarer Beschreibung, soweit aus der Quelle erkennbar.`,
    "3. Gib jedes erkannte rollenpassende Gericht nur einmal in dishes aus.",
    "4. Entferne keine Gerichte wegen Allergenen, Ausschluessen, Unvertraeglichkeiten oder Vorlieben; diese Pruefung uebernimmt das Backend.",
    "5. Markiere nur einen sichtbaren moeglichen Vorliebenbezug mit matchedPreferenceValue, wenn er exakt einem aktiven primaryLikes-Wert entspricht; sonst null.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Strukturierter Auftrag:",
    JSON.stringify(structuredAssignment, null, 2),
    "",
    "Verbindliche Regeln:",
    ...roleAssignment.rules,
    ...rolePreferenceAssignment.rules,
    ...searchAssignment.rules,
    ...pdfFileFallbackRules,
    "- Alle Ausschluesse, Unvertraeglichkeiten und aktiven Allergene sind harte Tabus.",
    "- Harte Tabus stehen immer ueber Vorlieben, Situation, Beliebtheit, Preis, Kategorie oder Restaurantklassikern.",
    "- Vorlieben sind positive Orientierung; sie duerfen harte Tabus niemals ueberstimmen.",
    "- Backend-Safety entfernt harte Konflikte nachgelagert fail-closed; du darfst im Main-AI-Output keine Gerichte wegen Safety oder Vorlieben entfernen.",
    "- Gib keine removedDishes, safeCandidates, recommendations, recommendationPayload, reason, scoreReason, detectedConflicts, isSafe oder profileSafety aus.",
    `- Nutze nur echte Gerichte aus dem Rollenraum ${roleAssignment.label}, die belegbar in der Speisekarte vorkommen.`,
    "- Liefere maximal 10 Compact-Dishes.",
    "- Vorlieben duerfen die Reihenfolge beeinflussen, aber neutrale Gerichte nicht aus dem Kandidatenpool verdraengen.",
    "- Keine rollenfremden Gerichte, Desserts, Getraenke, Beilagen, Zutaten oder Beschreibungsteile empfehlen.",
    "- Ein Gericht darf im JSON nur einmal vorkommen.",
    "- Gib keine Duplikate und keine nahezu identischen Varianten desselben Gerichts aus.",
    "- Ein Gericht darf nicht wegen fehlendem Preis ausgeschlossen werden.",
    "- Wenn fuer einen sichtbaren Menueeintrag ein Preis mit sichtbarer Waehrung sichtbar und eindeutig diesem Gericht zuordenbar ist, muss der Preis exakt aus der Quelle uebernommen werden.",
    "- priceRaw muss immer string oder null sein.",
    "- Verwende null, wenn fuer diesen konkreten Menueeintrag kein Preis mit sichtbarer Waehrung sichtbar oder nicht eindeutig zuordenbar ist.",
    "- Verwende niemals 0, \"0\", \"N/A\", \"unbekannt\" oder leere Strings als Fehlwert fuer fehlende Preise.",
    "- sourceEvidence soll geliefert werden, wenn ein kurzer Beleg sicher moeglich ist.",
    "- sourceEvidence darf null oder fehlen, wenn kein knapper Beleg sicher angegeben werden kann.",
    "- Wenn der sichtbare Menueeintrag eine echte Beschreibung enthaelt, gib descriptionOriginal als vollstaendige originale Beschreibung aus.",
    "- translatedDescription ist optional und darf nur gesetzt werden, wenn descriptionOriginal vorhanden ist.",
    `- translatedDescription muss descriptionOriginal treu in ${targetLanguage} (${targetLocale}) wiedergeben.`,
    "- Wenn keine echte Beschreibung sichtbar ist, lasse descriptionOriginal und translatedDescription null oder weg.",
    "- Erfinde keine Beschreibung, Zutaten oder Details.",
    "- Gib keine freie Begruendung aus; persoenliche und neutrale Reasons erzeugt ausschliesslich das Backend.",
    "- Jedes Gericht mit Profilbezug muss matchedPreferenceValue liefern.",
    "- matchedPreferenceValue muss exakt ein aktiver Wert aus primaryLikes sein; keine erfundenen, deaktivierten oder frueheren Profilwerte.",
    "- Wenn kein belastbarer Profilbezug belegbar ist, muss matchedPreferenceValue null sein.",
    "- translatedName ist Pflicht und ist die nutzerseitige Anzeigeuebersetzung in der Zielsprache.",
    `- translatedName muss in ${targetLanguage} (${targetLocale}) formuliert sein.`,
    "- Jede Empfehlung muss einen display-sicheren translatedName enthalten.",
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Kopiere nameOriginal nicht einfach als translatedName, wenn der Originalname fremdsprachig ist; liefere dann eine knappe belegbare Anzeigeuebersetzung.",
    "- Eigennamen oder unveraenderliche Gerichtstitel duerfen teilweise erhalten bleiben, aber translatedName muss trotzdem in der Zielsprache verstaendlich sein.",
    "- Uebersetze nur, was durch sourceEvidence oder Speisekartentext belegbar ist.",
    "- Erfinde keine Zutaten und fuege keine freien Ausschmueckungen hinzu.",
    "- Keine nachgelagerte Qualitaetskontrolle voraussetzen: die Auswahl muss in diesem Call korrekt sein.",
    "- Kein PDF-Fuzzy-Matching voraussetzen: entscheide nur aus dem sichtbaren Speisekartenkontext.",
    "",
    buildMainDishProfileContext(profile, situation, roleAssignment, activePreferences, searchAssignment),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "dishes": [',
    "    {",
    '      "nameOriginal": "exakter Originalname aus der Speisekarte",',
    '      "descriptionOriginal": "vollstaendige sichtbare Originalbeschreibung falls vorhanden, sonst null",',
    '      "translatedName": "display-sichere nutzerseitige Anzeigeuebersetzung in der Zielsprache",',
    '      "translatedDescription": "treue Uebersetzung der Originalbeschreibung falls vorhanden, sonst null",',
    '      "priceRaw": "exakter Preis mit sichtbarer Waehrung, wenn eindeutig diesem Gericht zuordenbar, sonst null",',
    '      "sourceEvidence": "kurzer belegender Originalausschnitt aus der Speisekarte",',
    '      "sourceKind": "pdf | html | image | text | unknown",',
    '      "sourceUrl": "Quellen-URL falls bekannt, sonst null",',
    '      "sourceCategoryOriginal": "sichtbare Kategorie falls hilfreich, sonst null",',
    '      "matchedPreferenceValue": "exakter aktiver primaryLikes-Wert oder null"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function buildPdfFileFallbackRules(source: TwoStepMenuSourceInput, activePreferences: string[]) {
  if (source.kind !== "pdf" || source.mainAiInputMode !== "pdf_file_fallback") {
    return [];
  }

  const preferenceList = listOrNone(activePreferences);

  return [
    "PDF-Datei-Fallback ohne extrahierbaren Text:",
    "- Pruefe jede Seite der bereitgestellten PDF-Datei vollstaendig.",
    "- Beende die Suche nicht nach den ersten passenden Gerichten.",
    "- Beruecksichtige Gerichte aus allen Seiten; ignoriere keine spaetere Seite nur deshalb, weil auf einer frueheren Seite bereits Kandidaten gefunden wurden.",
    `- Suche auf allen Seiten ausdruecklich nach Gerichten, die zu den aktiven Vorlieben passen: ${preferenceList}.`,
    "- Bevorzuge bestaetigte Vorliebenuebereinstimmungen im Kandidatenpool, solange sie im angeforderten Rollenraum liegen und nicht sichtbar harte Tabus verletzen.",
    "- Ergaenze Kandidaten ohne Vorliebenuebereinstimmung nur, wenn nicht genuegend passende Kandidaten vorhanden sind.",
    "- Erfinde keinen Vorliebenbezug; matchedPreferenceValue darf nur ein exakt aktiver primaryLikes-Wert sein.",
    "- Uebernehme sichtbare Originalbeschreibungen aus der PDF in descriptionOriginal.",
    "- Wenn keine Beschreibung sichtbar ist, lasse descriptionOriginal und translatedDescription null.",
    "- Erfinde keine Zutaten, Zubereitungsarten oder Beschreibungen aus allgemeinem Kuechenwissen.",
    "- Kandidaten muessen tatsaechlich in der PDF sichtbar sein; Name und Beschreibung muessen aus der Quelle stammen.",
    "- Halte das bestehende Kandidatenlimit ein; fuehre keine starre Kategoriequote ein."
  ];
}

function buildMainDishProfileContext(
  profile: UserProfile,
  situation: Situation | undefined,
  roleAssignment: RequestedDishRoleAssignment,
  positivePreferences: string[],
  searchAssignment: ActivePreferenceSearchAssignment
) {
  const hardExclusions = uniqueValues(arrayValue(profile.customExclusions));
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));
  return [
    "Nutzerprofil fuer diesen Main-AI-Call:",
    `- Ausgabesprache nur fuer nutzerseitige Texte, kein Auswahlkriterium: ${profile.outputLocale || "de-DE"}`,
    `- Angeforderter Gerichtsrollenraum: ${roleAssignment.label} (${roleAssignment.roles.join(", ")})`,
    `- Kompatibilitaets-Situation alter Clients, kein aktiver Auswahlmodus: ${situation || "nicht angegeben"}`,
    `- Anzahl aktiver heutiger Vorlieben/Wunschrichtungen: ${positivePreferences.length}`,
    `- Aktive heutige Vorlieben/Wunschrichtungen: ${listOrNone(positivePreferences)}`,
    `- Aktiver Suchauftrag: ${searchAssignment.instruction}`,
    `- Aktiver Suchraum: ${roleAssignment.label}; innerhalb davon ${searchAssignment.searchSpaceLabel}`,
    `- Aktive Ausschluesse und Unvertraeglichkeiten: ${listOrNone(hardExclusions)}`,
    `- Aktive Allergene: ${listOrNone(hardAllergens)}`,
    "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten sind wichtiger als Vorlieben und Rollenwahl.",
    "- Bei harten Ausschluessen, Allergien und Unvertraeglichkeiten gilt: Nur sichtbare Konflikte aus Gerichtsname oder Beschreibung entfernen; nicht wegen blosser Vermutung entfernen.",
    "- Aktive Vorlieben priorisieren nur innerhalb des angeforderten Rollenraums.",
    "- Diese Signale stammen aus dem aktuellen Request-Profil und duerfen nicht aus frueheren Analysen ersetzt werden."
  ].join("\n");
}

function buildStructuredMainDishAssignment({
  profile,
  situation,
  roleAssignment,
  activePreferences,
  searchAssignment,
  targetLocale
}: {
  profile: UserProfile;
  situation?: Situation;
  roleAssignment: RequestedDishRoleAssignment;
  activePreferences: string[];
  searchAssignment: ActivePreferenceSearchAssignment;
  targetLocale: string;
}) {
  const hardExclusions = uniqueValues(arrayValue(profile.customExclusions));
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));

  return {
    analyse: {
      profil: {
        vorlieben: activePreferences,
        ausschluesse_und_unvertraeglichkeiten: hardExclusions,
        allergene: hardAllergens,
        ausgabesprache: targetLocale
      },
      situation: {
        modus: situation || "nicht angegeben",
        kompatibilitaet_nur_fuer_alte_clients: true
      },
      regeln: {
        angeforderte_gerichtrollen: roleAssignment.roles,
        rollenraum_label: roleAssignment.label,
        zuerst_alle_erkennbaren_gerichte_im_rollenraum_analysieren: true,
        rollenfremde_gerichte_aus_kandidatenraum_entfernen: true,
        keine_rollenfremde_auffuellung: true,
        gerichtsnamen_und_vollstaendige_sichtbare_beschreibungen_pruefen: true,
        jedes_gericht_nur_einmal_ausgeben: true,
        maximal_10_compact_dishes: true,
        weniger_als_10_liefert_alle_geeigneten: true,
        keine_kuenstliche_mindestanzahl: true,
        neutrale_gerichte_nicht_durch_vorlieben_verdraengen: true,
        keine_finale_empfehlung_im_main_ai_output: true,
        backend_prueft_harte_safety_fail_closed: true,
        backend_rankt_vorlieben_weich: true,
        backend_waehlt_maximal_drei_finale_empfehlungen: true,
        harte_ausschluesse_sind_verbindlich: true,
        allergene_sind_verbindlich: true,
        unvertraeglichkeiten_sind_verbindlich: true,
        vorlieben_sind_positive_orientierung: true,
        vorlieben_duerfen_harte_ausschluesse_nicht_ueberstimmen: true,
        nur_speisekarteninformationen: true,
        beschreibung_nur_wenn_vorhanden: true,
        keine_beschreibung_erfinden: true,
        translated_name_pflicht_und_display_sicher: true,
        translated_name_darf_bei_fremdsprachigem_original_nicht_blosse_kopie_sein: true,
        keine_removed_dishes_ausgeben: true,
        keine_safe_candidates_ausgeben: true,
        keine_recommendations_ausgeben: true,
        keine_recommendation_payloads_ausgeben: true,
        keine_freien_reasons_ausgeben: true,
        keine_nachgelagerte_qualitaetskontrolle: true,
        kein_pdf_fuzzy_matching: true
      },
      suchauftrag: {
        instruktion: searchAssignment.instruction,
        suchraum: searchAssignment.searchSpaceLabel
      },
      speisekarte: "siehe Quellenkontext/Speisekartentext oder angehaengte Speisekartendateien"
    },
    auftrag: `Analysiere alle erkennbaren Gerichte im Rollenraum ${roleAssignment.label}, entferne nur rollenfremde Eintraege und gib jedes verbleibende Gericht genau einmal in dishes aus. Backend-Safety, Vorliebengewichtung, Backfill und finale Auswahl folgen danach.`
  };
}

type RequestedDishRoleAssignment = {
  roles: RequestedDishRole[];
  label: string;
  analysisTarget: string;
  mapperCategory: string;
  primaryRole: RequestedDishRole;
  dishRole: "starter" | "main";
  rules: string[];
};

function buildRequestedDishRoleAssignment(values?: RequestedDishRole[]): RequestedDishRoleAssignment {
  const roles = normalizeRequestedDishRoles(values);

  if (roles.includes("starter") || roles.includes("salad")) {
    return {
      roles: ["starter", "salad"],
      label: "Vorspeisen und Salate",
      analysisTarget: "Vorspeisen und Salate",
      mapperCategory: "AI-Vorspeisen-/Salatempfehlung",
      primaryRole: "starter",
      dishRole: "starter",
      rules: [
        "- Der aktive Rollenraum ist ausschliesslich starter und salad.",
        "- Identifiziere sichtbare Vorspeisen, Antipasti, Suppen nur wenn als Vorspeise erkennbar, und Salate.",
        "- Hauptgerichte, Pasta-/Pizza-/Fleisch-/Fisch-Hauptspeisen und vollwertige Hauptplatten duerfen nicht als Ersatz empfohlen werden.",
        "- Wenn weniger als 10 sichtbare Vorspeisen oder Salate vorhanden sind, liefere alle geeigneten statt mit Hauptgerichten aufzufuellen."
      ]
    };
  }

  return {
    roles: ["main"],
    label: "Hauptspeisen",
    analysisTarget: "Hauptspeisen",
    mapperCategory: "AI-Hauptempfehlung",
    primaryRole: "main",
    dishRole: "main",
    rules: [
      "- Der aktive Rollenraum ist ausschliesslich main.",
      "- Identifiziere sichtbare Hauptgerichte und vollwertige Hauptspeisen.",
      "- Vorspeisen, Salate als reine Vorspeisen, Desserts, Getraenke und Beilagen duerfen nicht als Ersatz empfohlen werden.",
      "- Wenn weniger als 10 sichtbare Hauptspeisen vorhanden sind, liefere alle geeigneten statt mit Vorspeisen oder Salaten aufzufuellen."
    ]
  };
}

function buildPreferredDishRoleAssignment(
  preferredDishRole: PreferredDishRole | undefined,
  roleAssignment: RequestedDishRoleAssignment
) {
  if (preferredDishRole !== "starter" || !roleAssignment.roles.includes("starter")) {
    return {
      rules: []
    };
  }

  return {
    rules: [
      "- Optionale Rollenpraeferenz innerhalb dieses Rollenraums: Bevorzuge sichere Vorspeisen gegenueber sicheren Salaten, wenn sie ansonsten aehnlich geeignet sind.",
      "- Diese Praeferenz darf Safety, harte Profilwerte oder den verbindlichen Rollenraum niemals ueberstimmen.",
      "- Salate bleiben erlaubt und duerfen im Kandidatenpool bleiben.",
      "- Liefere nicht weniger Kandidaten nur weil weniger Vorspeisen vorhanden sind; nimm auch sichtbare Salate in den Kandidatenpool auf.",
      "- Innerhalb derselben Rolle bleiben primaryLikes fuer das Ranking aktiv."
    ]
  };
}

function normalizeRequestedDishRoles(values?: RequestedDishRole[]): RequestedDishRole[] {
  const allowed = new Set<RequestedDishRole>(["starter", "salad", "main"]);
  const roles = Array.isArray(values)
    ? values.filter((value): value is RequestedDishRole => allowed.has(value))
    : [];

  if (roles.includes("starter") || roles.includes("salad")) {
    return ["starter", "salad"];
  }

  return ["main"];
}

type ActivePreferenceSearchAssignment = {
  kind: "none" | "single" | "multiple";
  instruction: string;
  searchSpaceLabel: string;
  rules: string[];
};

function getActivePreferenceValues(profile: UserProfile) {
  return uniqueValues([
    ...arrayValue(profile.primaryLikes)
  ]);
}

function buildActivePreferenceSearchAssignment(values: string[]): ActivePreferenceSearchAssignment {
  if (values.length === 0) {
    return {
      kind: "none",
      instruction: "Liefere bis zu 10 passende Kandidaten aus dem angeforderten Rollenraum.",
      searchSpaceLabel: "allgemeine passende Gerichte im angeforderten Rollenraum",
      rules: [
        "- Es gibt keine aktive Wunschrichtung; liefere bis zu 10 echte Kandidaten aus dem angeforderten Rollenraum.",
        "- Wenn weniger als 10 rollenpassende Gerichte sichtbar sind, liefere alle geeigneten.",
        "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten werden nachgelagert vom Backend geprueft."
      ]
    };
  }

  if (values.length === 1) {
    const searchTarget = toSearchTargetLabel(values[0]!);

    return {
      kind: "single",
      instruction: `Liefere bis zu 10 Kandidaten aus dem angeforderten Rollenraum und priorisiere dabei den aktiven Suchraum: ${searchTarget}.`,
      searchSpaceLabel: searchTarget,
      rules: [
        `- Wenn die Speisekarte passende ${searchTarget} enthaelt, sortiere diese im Kandidatenpool nach vorne.`,
        `- Wenn weniger passende ${searchTarget} sichtbar sind, ergaenze mit anderen sichtbaren Gerichten aus dem angeforderten Rollenraum, bis maximal 10 Kandidaten erreicht sind.`,
        "- Verdraenge neutrale rollenpassende Gerichte nicht nur wegen fehlendem Vorliebenbezug.",
        "- Fuelle nicht mit Kategorien ausserhalb des Rollenraums auf.",
        "- Erfinde nichts.",
        "- Nutze nur echte Gerichte aus der Speisekarte."
      ]
    };
  }

  const searchTargets = uniqueValues(values.map(toSearchTargetLabel));
  const searchSpace = joinSearchTargets(searchTargets);

  return {
    kind: "multiple",
    instruction: `Liefere bis zu 10 Kandidaten aus dem angeforderten Rollenraum und priorisiere dabei den aktiven Suchraum: ${searchSpace}.`,
    searchSpaceLabel: searchSpace,
    rules: [
      "- Kandidaten aus diesem Suchraum stehen weiter vorne, wenn passende Gerichte vorhanden sind.",
      "- Verdraenge neutrale rollenpassende Gerichte nicht nur wegen fehlendem Vorliebenbezug.",
      "- Wenn nur weniger Treffer im Suchraum erkennbar sind, ergaenze mit anderen sichtbaren Gerichten aus dem angeforderten Rollenraum, bis maximal 10 Kandidaten erreicht sind.",
      "- Wenn weniger als 10 rollenpassende Gerichte sichtbar sind, liefere alle geeigneten.",
      "- Erfinde nichts.",
      "- Nutze nur echte Gerichte aus der Speisekarte."
    ]
  };
}

function toSearchTargetLabel(value: string) {
  const normalized = normalizePreference(value);

  if (normalized.includes("pizza")) return "Pizzen";
  if (/\b(?:pasta|nudel|nudeln|spaghetti|tagliatelle|linguine|penne|rigatoni|gnocchi)\b/.test(normalized)) {
    return "Pasta- oder Nudelgerichte";
  }
  if (/\b(?:salat|salate|salad|salads)\b/.test(normalized)) {
    return "Hauptgerichte im angeforderten Rollenraum";
  }
  if (/\b(?:fleisch|meat|rind|kalb|schwein|gefluegel|geflugel|huhn|haehnchen|hahnchen|lamm|steak)\b/.test(normalized)) {
    return "Fleischgerichte";
  }
  if (/\b(?:fisch|fish|seafood|meeresfruechte|meeresfruchte|garnelen|scampi|lachs|thunfisch)\b/.test(normalized)) {
    return "Fischgerichte oder Seafood";
  }
  if (/\b(?:vegetarisch|vegetarian|veggie)\b/.test(normalized)) {
    return "vegetarische Gerichte";
  }
  if (/\b(?:gemuese|gemuse|vegetable|vegetables)\b/.test(normalized)) {
    return "gemuesebasierte Gerichte";
  }
  if (/\b(?:ei|eier|egg|eggs|uovo|uova|oeuf|oeufs|huevo|huevos)\b/.test(normalized)) {
    return "eibasierte Gerichte";
  }
  if (/\b(?:kaese|kase|cheese|formaggio)\b/.test(normalized)) {
    return "kaesebetonte Hauptgerichte";
  }

  return value.trim();
}

function joinSearchTargets(values: string[]) {
  if (values.length <= 1) return values[0] ?? "aktive Vorlieben";
  if (values.length === 2) return `${values[0]} oder ${values[1]}`;

  return `${values.slice(0, -1).join(", ")} oder ${values[values.length - 1]}`;
}

function arrayValue(values?: string[]) {
  return Array.isArray(values) ? values.filter((value) => value.trim().length > 0) : [];
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizePreference(item) === normalizePreference(value)) ? result : [...result, value];
  }, []);
}

function normalizePreference(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function listOrNone(values: string[]) {
  return values.length > 0 ? values.join(", ") : "keine";
}
