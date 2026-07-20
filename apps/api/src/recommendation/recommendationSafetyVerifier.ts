import type { UserProfile } from "../types/profile";

export type RecommendationSafetyRestriction = {
  id: string;
  type: "allergen" | "exclusion";
  label: string;
};

export type RecommendationSafetyCandidate = {
  id: string;
  nameOriginal: string;
  descriptionOriginal?: string | null;
};

export type RecommendationSafetyVerdict = "safe" | "conflict" | "uncertain";
export type RecommendationSafetyEvidenceSource = "name" | "description";

export type RecommendationSafetyCheck = {
  restrictionId?: string;
  verdict?: string;
  evidence?: string | null;
  source?: string | null;
};

export type RecommendationSafetyCandidateResult = {
  candidateId?: string;
  checks?: RecommendationSafetyCheck[];
};

export type RecommendationSafetyVerifierResponse = {
  candidates?: RecommendationSafetyCandidateResult[];
};

export type RecommendationSafetyValidationResult = {
  candidateId: string;
  safe: boolean;
  reason?: "invalid_response" | "conflict" | "uncertain";
};

export type RecommendationSafetyDiagnostics = {
  safetyRequestedCandidateCount: number;
  mainCandidateIdCount: number;
  mainUniqueCandidateIdCount: number;
  safetyReturnedCandidateIdCount: number;
  safetyReturnedCheckCount: number;
  safetyUniqueReturnedCandidateIdCount: number;
  safetyMissingCandidateCount: number;
  safetyDuplicateCandidateIdCount: number;
  safetyUnknownCandidateIdCount: number;
  safetyMissingVerdictCount: number;
  safetyInvalidVerdictCount: number;
  safetyInvalidSchemaCount: number;
  safetyParseFailureCount: number;
  safetyExceptionCount: number;
  safetyTimeoutCount: number;
  safetyEmptyResponseCount: number;
  safetyTruncatedOrIncompleteCount: number;
};

export function buildRecommendationSafetyRestrictions(profile: Partial<UserProfile>): RecommendationSafetyRestriction[] {
  return [
    ...arrayValue(profile.allergens).map((label, index) => ({
      id: `allergen_${index}`,
      type: "allergen" as const,
      label
    })),
    ...arrayValue(profile.customExclusions).map((label, index) => ({
      id: `exclusion_${index}`,
      type: "exclusion" as const,
      label
    }))
  ];
}

export function validateRecommendationSafetyResponse({
  restrictions,
  candidates,
  response
}: {
  restrictions: RecommendationSafetyRestriction[];
  candidates: RecommendationSafetyCandidate[];
  response: RecommendationSafetyVerifierResponse;
}): RecommendationSafetyValidationResult[] {
  return validateRecommendationSafetyResponseWithDiagnostics({
    restrictions,
    candidates,
    response
  }).validation;
}

export function validateRecommendationSafetyResponseWithDiagnostics({
  restrictions,
  candidates,
  response,
  callFailure
}: {
  restrictions: RecommendationSafetyRestriction[];
  candidates: RecommendationSafetyCandidate[];
  response: RecommendationSafetyVerifierResponse;
  callFailure?: Partial<Pick<RecommendationSafetyDiagnostics,
    "safetyParseFailureCount" |
    "safetyExceptionCount" |
    "safetyTimeoutCount"
  >>;
}): {
  validation: RecommendationSafetyValidationResult[];
  diagnostics: RecommendationSafetyDiagnostics;
} {
  const diagnostics = buildEmptySafetyDiagnostics({
    candidates,
    response,
    callFailure
  });

  if (restrictions.length === 0) {
    return {
      validation: candidates.map((candidate) => ({
        candidateId: candidate.id,
        safe: true
      })),
      diagnostics
    };
  }

  const restrictionIds = new Set(restrictions.map((restriction) => restriction.id));
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const responseCandidates = Array.isArray(response.candidates) ? response.candidates : [];
  const resultsById = new Map<string, RecommendationSafetyValidationResult>();

  for (const candidate of candidates) {
    resultsById.set(candidate.id, {
      candidateId: candidate.id,
      safe: false,
      reason: "invalid_response"
    });
  }

  const seenCandidateIds = new Set<string>();

  for (const candidateResult of responseCandidates) {
    if (!candidateResult || typeof candidateResult !== "object") {
      diagnostics.safetyInvalidSchemaCount += 1;
      continue;
    }

    const candidateId = candidateResult.candidateId?.trim();

    if (!candidateId || !candidateIds.has(candidateId)) {
      diagnostics.safetyUnknownCandidateIdCount += candidateId ? 1 : 0;
      continue;
    }

    if (seenCandidateIds.has(candidateId)) {
      diagnostics.safetyDuplicateCandidateIdCount += 1;
      resultsById.set(candidateId, {
        candidateId,
        safe: false,
        reason: "invalid_response"
      });
      continue;
    }

    seenCandidateIds.add(candidateId);
    const candidate = candidatesById.get(candidateId);

    if (!candidate || !Array.isArray(candidateResult.checks)) {
      diagnostics.safetyInvalidSchemaCount += 1;
      continue;
    }

    const checksByRestrictionId = new Map<string, RecommendationSafetyCheck>();
    let invalid = false;

    for (const check of candidateResult.checks) {
      const restrictionId = check.restrictionId?.trim();

      if (!restrictionId || !restrictionIds.has(restrictionId) || checksByRestrictionId.has(restrictionId)) {
        diagnostics.safetyInvalidSchemaCount += 1;
        invalid = true;
        break;
      }

      checksByRestrictionId.set(restrictionId, check);
    }

    if (checksByRestrictionId.size !== restrictions.length) {
      invalid = true;
    }

    if (invalid) {
      continue;
    }

    let unsafeReason: RecommendationSafetyValidationResult["reason"];

    for (const restriction of restrictions) {
      const check = checksByRestrictionId.get(restriction.id);
      const verdict = normalizeVerdict(check?.verdict);

      if (!check || !verdict) {
        if (!check?.verdict?.trim()) {
          diagnostics.safetyMissingVerdictCount += 1;
        } else {
          diagnostics.safetyInvalidVerdictCount += 1;
        }
        unsafeReason = "invalid_response";
        break;
      }

      if (verdict === "conflict") {
        const evidence = check.evidence?.trim();
        const source = normalizeSource(check.source);

        if (!evidence || !source || !candidateContainsEvidence(candidate, evidence, source)) {
          unsafeReason = "invalid_response";
          break;
        }
      }

      if (verdict === "conflict") {
        unsafeReason = "conflict";
        break;
      }

      if (verdict === "uncertain") {
        unsafeReason = "uncertain";
        break;
      }
    }

    resultsById.set(candidateId, {
      candidateId,
      safe: !unsafeReason,
      reason: unsafeReason
    });
  }

  const validation: RecommendationSafetyValidationResult[] = candidates.map((candidate) => resultsById.get(candidate.id) ?? {
    candidateId: candidate.id,
    safe: false,
    reason: "invalid_response" as const
  });
  const seenKnownCandidateIds = new Set(
    responseCandidates
      .map((candidateResult) => candidateResult?.candidateId?.trim())
      .filter((candidateId): candidateId is string => Boolean(candidateId && candidateIds.has(candidateId)))
  );
  diagnostics.safetyMissingCandidateCount = candidates.filter((candidate) => !seenKnownCandidateIds.has(candidate.id)).length;
  const expectedCheckCount = candidates.length * restrictions.length;
  if (
    diagnostics.safetyEmptyResponseCount > 0 ||
    diagnostics.safetyMissingCandidateCount > 0 ||
    diagnostics.safetyReturnedCheckCount < expectedCheckCount
  ) {
    diagnostics.safetyTruncatedOrIncompleteCount = 1;
  }

  return {
    validation,
    diagnostics
  };
}

export function filterSafeRecommendationCandidates<TCandidate extends RecommendationSafetyCandidate>({
  restrictions,
  candidates,
  response,
  callFailure
}: {
  restrictions: RecommendationSafetyRestriction[];
  candidates: TCandidate[];
  response: RecommendationSafetyVerifierResponse;
  callFailure?: Partial<Pick<RecommendationSafetyDiagnostics,
    "safetyParseFailureCount" |
    "safetyExceptionCount" |
    "safetyTimeoutCount"
  >>;
}) {
  const { validation, diagnostics } = validateRecommendationSafetyResponseWithDiagnostics({
    restrictions,
    candidates,
    response,
    callFailure
  });
  const safeIds = new Set(validation.filter((result) => result.safe).map((result) => result.candidateId));

  return {
    candidates: candidates.filter((candidate) => safeIds.has(candidate.id)),
    validation,
    diagnostics
  };
}

export function candidateContainsEvidence(
  candidate: RecommendationSafetyCandidate,
  evidence: string,
  source: RecommendationSafetyEvidenceSource
) {
  const evidenceNeedle = normalizeEvidenceText(evidence);

  if (!evidenceNeedle) {
    return false;
  }

  const sourceText = source === "name" ? candidate.nameOriginal : candidate.descriptionOriginal ?? "";

  return normalizeEvidenceText(sourceText).includes(evidenceNeedle);
}

function normalizeVerdict(value: string | undefined): RecommendationSafetyVerdict | null {
  if (
    value === "safe" ||
    value === "conflict" ||
    value === "uncertain"
  ) {
    return value;
  }

  return null;
}

function buildEmptySafetyDiagnostics({
  candidates,
  response,
  callFailure
}: {
  candidates: RecommendationSafetyCandidate[];
  response: RecommendationSafetyVerifierResponse;
  callFailure?: Partial<Pick<RecommendationSafetyDiagnostics,
    "safetyParseFailureCount" |
    "safetyExceptionCount" |
    "safetyTimeoutCount"
  >>;
}): RecommendationSafetyDiagnostics {
  const responseCandidates = Array.isArray(response.candidates) ? response.candidates : [];
  const returnedCandidateIds = responseCandidates
    .map((candidateResult) => candidateResult?.candidateId?.trim())
    .filter((candidateId): candidateId is string => Boolean(candidateId));
  const returnedCheckCount = responseCandidates.reduce((count, candidateResult) => (
    count + (Array.isArray(candidateResult?.checks) ? candidateResult.checks.length : 0)
  ), 0);

  return {
    safetyRequestedCandidateCount: candidates.length,
    mainCandidateIdCount: candidates.length,
    mainUniqueCandidateIdCount: new Set(candidates.map((candidate) => candidate.id)).size,
    safetyReturnedCandidateIdCount: returnedCandidateIds.length,
    safetyReturnedCheckCount: returnedCheckCount,
    safetyUniqueReturnedCandidateIdCount: new Set(returnedCandidateIds).size,
    safetyMissingCandidateCount: 0,
    safetyDuplicateCandidateIdCount: 0,
    safetyUnknownCandidateIdCount: 0,
    safetyMissingVerdictCount: 0,
    safetyInvalidVerdictCount: 0,
    safetyInvalidSchemaCount: Array.isArray(response.candidates) ? 0 : 1,
    safetyParseFailureCount: callFailure?.safetyParseFailureCount ?? 0,
    safetyExceptionCount: callFailure?.safetyExceptionCount ?? 0,
    safetyTimeoutCount: callFailure?.safetyTimeoutCount ?? 0,
    safetyEmptyResponseCount: responseCandidates.length === 0 && candidates.length > 0 ? 1 : 0,
    safetyTruncatedOrIncompleteCount: 0
  };
}

function normalizeSource(value: string | null | undefined): RecommendationSafetyEvidenceSource | null {
  if (value === "name" || value === "description") {
    return value;
  }

  return null;
}

function normalizeEvidenceText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019`\u00b4]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function arrayValue(values?: string[]) {
  return Array.isArray(values) ? values.filter((value) => value.trim().length > 0) : [];
}
