import type {
  MainDishAIRecommendation,
  MainDishAISafeCandidate
} from "../ai/twoStepRecommendationSchemas";
import type { UserProfile } from "../types/profile";

export type SemanticEvidenceRestriction = {
  id: string;
  type: "allergen" | "exclusion";
  label: string;
};

export type SemanticEvidenceSafetyMatch = {
  restrictionId?: string;
  evidence?: string;
  source?: string;
  relation?: string;
};

export type SemanticEvidenceCandidate = {
  nameOriginal: string;
  descriptionOriginal?: string | null;
  sourceEvidence?: string | null;
  sourceLine?: string | null;
  safetyMatches?: SemanticEvidenceSafetyMatch[];
};

export type SemanticEvidenceRemoval = {
  nameOriginal: string;
  restrictionId: string;
  restrictionType: SemanticEvidenceRestriction["type"];
  restrictionLabel: string;
  evidence: string;
  source: "name" | "description";
  relation: "contains" | "may_contain";
};

export function buildSemanticEvidenceRestrictions(profile: Partial<UserProfile>): SemanticEvidenceRestriction[] {
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

export function applySemanticEvidenceSafetyGate<TCandidate extends SemanticEvidenceCandidate>({
  candidates,
  restrictions
}: {
  candidates: TCandidate[];
  restrictions: SemanticEvidenceRestriction[];
}) {
  if (candidates.length === 0 || restrictions.length === 0) {
    return {
      candidates,
      removed: [] as SemanticEvidenceRemoval[]
    };
  }

  const restrictionsById = new Map(restrictions.map((restriction) => [restriction.id, restriction]));
  const kept: TCandidate[] = [];
  const removed: SemanticEvidenceRemoval[] = [];

  for (const candidate of candidates) {
    const removal = getSemanticEvidenceRemoval(candidate, restrictionsById);

    if (removal) {
      removed.push(removal);
      continue;
    }

    kept.push(candidate);
  }

  return {
    candidates: kept,
    removed
  };
}

export function rebuildMainDishRecommendationsFromSemanticSafeCandidates({
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

function getSemanticEvidenceRemoval(
  candidate: SemanticEvidenceCandidate,
  restrictionsById: Map<string, SemanticEvidenceRestriction>
): SemanticEvidenceRemoval | null {
  for (const match of candidate.safetyMatches ?? []) {
    const restrictionId = match.restrictionId?.trim();
    const evidence = match.evidence?.trim();
    const source = normalizeMatchSource(match.source);
    const relation = normalizeMatchRelation(match.relation);

    if (!restrictionId || !evidence || !source || !relation) {
      continue;
    }

    const restriction = restrictionsById.get(restrictionId);

    if (!restriction) {
      continue;
    }

    const blockingRelation = getBlockingRelationForRestriction(relation, restriction.type);

    if (!blockingRelation) {
      continue;
    }

    if (!candidateContainsEvidence(candidate, evidence, source)) {
      continue;
    }

    return {
      nameOriginal: candidate.nameOriginal,
      restrictionId,
      restrictionType: restriction.type,
      restrictionLabel: restriction.label,
      evidence,
      source,
      relation: blockingRelation
    };
  }

  return null;
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
    priceRaw: payload.priceRaw,
    sourceEvidence: payload.sourceEvidence,
    sourceKind: payload.sourceKind,
    sourceUrl: payload.sourceUrl,
    sourceCategoryOriginal: payload.sourceCategoryOriginal,
    reason: payload.reason,
    confidence: payload.confidence,
    profileSafety: payload.profileSafety
  };
}

function getBlockingRelationForRestriction(
  relation: "contains" | "may_contain" | "free_from" | "unknown",
  restrictionType: SemanticEvidenceRestriction["type"]
): SemanticEvidenceRemoval["relation"] | null {
  if (relation === "contains") {
    return relation;
  }

  if (relation === "may_contain" && restrictionType === "allergen") {
    return relation;
  }

  return null;
}

function candidateContainsEvidence(
  candidate: SemanticEvidenceCandidate,
  evidence: string,
  source: SemanticEvidenceRemoval["source"]
) {
  const evidenceNeedle = normalizeEvidenceText(evidence);

  if (!evidenceNeedle) {
    return false;
  }

  const sources = source === "name"
    ? [candidate.nameOriginal]
    : [candidate.descriptionOriginal, candidate.sourceEvidence, candidate.sourceLine];

  return sources.some((value) => normalizeEvidenceText(value ?? "").includes(evidenceNeedle));
}

function normalizeMatchSource(source: string | undefined): SemanticEvidenceRemoval["source"] | null {
  if (source === "name" || source === "description") {
    return source;
  }

  return null;
}

function normalizeMatchRelation(relation: string | undefined): SemanticEvidenceRemoval["relation"] | "free_from" | "unknown" | null {
  if (relation === "contains" || relation === "may_contain" || relation === "free_from" || relation === "unknown") {
    return relation;
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
