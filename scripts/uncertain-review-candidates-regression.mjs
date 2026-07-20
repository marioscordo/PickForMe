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
assert(
  route.includes("applyAllergySafetyGate({\n    dishes: mapped.dishes,\n    recommendations: mapped.recommendations,\n    profile\n  })"),
  "Review candidates must pass through the final hard allergy safety gate"
);
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
