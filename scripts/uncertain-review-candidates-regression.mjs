import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const route = read("apps/api/app/api/analyze-menu/route.ts");
const mainAi = read("apps/api/src/ai/recommendMainDishesAI.ts");
const apiTypes = read("apps/api/src/types/api.ts");
const mobileApi = read("apps/mobile/src/api/pickformeApi.ts");
const mobileTypes = read("apps/mobile/src/types/recommendations.ts");
const recommendationCard = read("apps/mobile/src/components/pick/RecommendationCard.tsx");
const deContent = read("apps/mobile/src/content/mobileContent.de-DE.json");
const enContent = read("apps/mobile/src/content/mobileContent.en-US.json");

assert(
  mainAi.includes("uncertainReviewCandidates: MainDishAISafeCandidate[]"),
  "Main AI result must carry a separate uncertain review candidate collection"
);
assert(
  mainAi.includes('result.reason === "uncertain"'),
  "Only explicitly validated uncertain candidates may enter the review collection"
);
assert(
  mainAi.includes("const uncertainReviewCandidates = verifierSafe.uncertainReviewCandidates ?? []"),
  "Uncertain candidates must be preserved across attribution without changing attribution"
);
assert(
  !mainAi.includes("verifyRecommendationSafetyAI({\n    restrictions,\n    candidates: verifierCandidates,\n    runId,\n    signal\n  }).catch(() => verifierResponse"),
  "Safety errors must not be converted into review candidates"
);

assert(
  route.includes('process.env.GUSTARO_UNCERTAIN_REVIEW_CANDIDATES === "true"'),
  "Review fallback must be guarded by the server-side feature flag"
);
assert(
  route.includes("supportsUncertainReviewCandidates !== true"),
  "Review fallback must require explicit client support"
);
assert(
  apiTypes.includes("supportsUncertainReviewCandidates?: boolean") &&
    mobileApi.includes("supportsUncertainReviewCandidates: true"),
  "Mobile must explicitly signal uncertain-review capability"
);
assert(
  route.includes('recommendationResultType: "uncertain_review"'),
  "Review response must use an explicit result type"
);
assert(
  mobileTypes.includes('recommendationResultType?: "uncertain_review"') &&
    recommendationCard.includes('result.recommendationResultType === "uncertain_review"'),
  "Mobile must type and detect uncertain-review responses"
);

assert(
  route.includes(".slice(0, 3)"),
  "Review fallback must return at most three candidates"
);
const uncertainReviewFunction = sliceBetween(
  route,
  "function buildUncertainReviewResponse({",
  "function mapUncertainReviewCandidatesToAnalyzeData"
);
const uncertainReviewGateIndex = uncertainReviewFunction.search(
  /const\s+allergySafeRecommendations\s*=\s*applyAllergySafetyGate\s*\(\s*{\s*dishes:\s*mapped\.dishes,\s*recommendations:\s*mapped\.recommendations,\s*profile\s*}\s*\)/m
);
const uncertainReviewResponseIndex = uncertainReviewFunction.indexOf('recommendationResultType: "uncertain_review"');
assert(
  uncertainReviewGateIndex >= 0 && uncertainReviewGateIndex < uncertainReviewResponseIndex,
  "Review candidates must pass through the final hard allergy safety gate"
);
const twoStepFlowBeforeReviewHelper = sliceBetween(
  route,
  "async function analyzeMenuWithTwoStepMainFlow({",
  "function buildUncertainReviewResponse({"
);
for (const noSafeIndex of indexesOf(twoStepFlowBeforeReviewHelper, '"NO_SAFE_RECOMMENDATIONS"')) {
  const previousReviewFallbackIndex = twoStepFlowBeforeReviewHelper.lastIndexOf(
    "const reviewResponse = buildUncertainReviewResponse({",
    noSafeIndex
  );
  assert(previousReviewFallbackIndex >= 0, "NO_SAFE_RECOMMENDATIONS must be preceded by a review fallback attempt");
  const betweenReviewAndNoSafe = normalizeWhitespace(
    twoStepFlowBeforeReviewHelper.slice(previousReviewFallbackIndex, noSafeIndex)
  );
  assert(
    betweenReviewAndNoSafe.includes("if (reviewResponse) { return reviewResponse; }"),
    "NO_SAFE_RECOMMENDATIONS must only be reached after an unsuccessful review fallback"
  );
}
assert(
  !route.includes("verifyRecommendationSafetyAI(") &&
    !route.includes("validateMainDishAttributions("),
  "Route-level review fallback must not add Safety or Attribution AI calls"
);
assert(
  !route.includes("backfillMainDishRecommendationsWithValidatedCandidates("),
  "Review fallback must not use normal backfill"
);

assert(
  recommendationCard.includes("content.recommendation.uncertainReviewWarning") &&
    recommendationCard.includes("showStartersAndSaladsAction && !isUncertainReview"),
  "Mobile must show the shared review warning and avoid nested recommendation actions in review mode"
);
assert(
  deContent.includes("uncertainReviewWarning") &&
    enContent.includes("uncertainReviewWarning"),
  "Both mobile locales must define the shared review warning"
);

console.log("uncertain-review-candidates-regression: passed");

function sliceBetween(value, startMarker, endMarker) {
  const start = value.indexOf(startMarker);
  assert(start >= 0, `missing start marker: ${startMarker}`);
  const end = value.indexOf(endMarker, start + startMarker.length);
  assert(end >= 0, `missing end marker: ${endMarker}`);
  return value.slice(start, end);
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function indexesOf(value, needle) {
  const indexes = [];
  let index = value.indexOf(needle);

  while (index >= 0) {
    indexes.push(index);
    index = value.indexOf(needle, index + needle.length);
  }

  return indexes;
}
