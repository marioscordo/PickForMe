import { calculateDistanceMeters } from "./distance";
import type {
  RestaurantCandidate,
  RestaurantDetectionResult,
  RestaurantDetectorConfidence,
  RestaurantDetectorInput,
  RestaurantProviderCandidate
} from "./types";

const MAX_CANDIDATES = 5;
const HIGH_CONFIDENCE_MAX_ACCURACY_METERS = 35;
const MEDIUM_CONFIDENCE_MAX_ACCURACY_METERS = 90;
const HIGH_CONFIDENCE_MAX_DISTANCE_METERS = 45;
const MEDIUM_CONFIDENCE_MAX_DISTANCE_METERS = 130;
const AMBIGUOUS_DISTANCE_DELTA_METERS = 30;

export function buildRestaurantDetectionResult(
  input: RestaurantDetectorInput,
  providerCandidates: RestaurantProviderCandidate[]
): RestaurantDetectionResult {
  const candidates = normalizeRestaurantCandidates(input, providerCandidates);
  const bestCandidate = candidates[0];
  const confidence = bestCandidate?.confidence ?? "low";

  return {
    ...(bestCandidate && confidence !== "low" ? { bestCandidate } : {}),
    candidates,
    confidence,
    requiresUserConfirmation: true
  };
}

export function normalizeRestaurantCandidates(
  input: RestaurantDetectorInput,
  providerCandidates: RestaurantProviderCandidate[]
): RestaurantCandidate[] {
  const seen = new Set<string>();
  const candidatesWithDistance = providerCandidates
    .filter((candidate) => candidate.name.trim())
    .map((candidate) => ({
      ...candidate,
      name: candidate.name.trim(),
      address: candidate.address?.trim(),
      distanceMeters: getCandidateDistance(input, candidate)
    }))
    .sort((left, right) => (left.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (right.distanceMeters ?? Number.MAX_SAFE_INTEGER))
    .filter((candidate) => {
      const key = [candidate.name, candidate.address, candidate.source, candidate.externalId].join("|").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES);

  return candidatesWithDistance.map((candidate, index) => ({
    ...candidate,
    confidence: scoreCandidateConfidence(input, candidate, candidatesWithDistance, index)
  }));
}

export function scoreCandidateConfidence(
  input: RestaurantDetectorInput,
  candidate: RestaurantProviderCandidate,
  orderedCandidates: RestaurantProviderCandidate[],
  index: number
): RestaurantDetectorConfidence {
  const distanceMeters = getCandidateDistance(input, candidate);
  const hintMatches = matchesHint(candidate.name, input.hint);
  const secondDistance = orderedCandidates[1]?.distanceMeters;
  const isAmbiguous =
    index > 0 ||
    (typeof secondDistance === "number" &&
      typeof distanceMeters === "number" &&
      secondDistance - distanceMeters <= AMBIGUOUS_DISTANCE_DELTA_METERS);

  if (input.accuracyMeters > MEDIUM_CONFIDENCE_MAX_ACCURACY_METERS) return "low";
  if (typeof distanceMeters !== "number") return hintMatches ? "medium" : "low";

  if (
    input.accuracyMeters <= HIGH_CONFIDENCE_MAX_ACCURACY_METERS &&
    distanceMeters <= HIGH_CONFIDENCE_MAX_DISTANCE_METERS &&
    !isAmbiguous
  ) {
    return "high";
  }

  if (
    distanceMeters <= MEDIUM_CONFIDENCE_MAX_DISTANCE_METERS ||
    (hintMatches && input.accuracyMeters <= MEDIUM_CONFIDENCE_MAX_ACCURACY_METERS)
  ) {
    return "medium";
  }

  return "low";
}

function getCandidateDistance(input: RestaurantDetectorInput, candidate: RestaurantProviderCandidate) {
  if (typeof candidate.distanceMeters === "number") return Math.max(0, Math.round(candidate.distanceMeters));
  if (typeof candidate.latitude !== "number" || typeof candidate.longitude !== "number") return undefined;

  return calculateDistanceMeters(input, {
    latitude: candidate.latitude,
    longitude: candidate.longitude
  });
}

function matchesHint(candidateName: string, hint: string | undefined) {
  const normalizedHint = normalizeSearchText(hint ?? "");
  if (!normalizedHint) return false;

  const normalizedName = normalizeSearchText(candidateName);
  return normalizedName.includes(normalizedHint) || normalizedHint.includes(normalizedName);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
