import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8");
const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8");

const requiredMainFields = [
  "mainRawOutputItemCount",
  "mainParsedCandidateCount",
  "mainInvalidStructureCount",
  "mainMissingNameCount",
  "mainMissingRoleCount",
  "mainInvalidRoleCount",
  "mainParseFailureCount",
  "mainEmptyResponseCount",
  "mainExceptionCount",
  "mainTimeoutCount",
  "mainTruncatedOrIncompleteCount",
  "mainNormalizedCandidateCount",
  "mainCourseFilteredCount",
  "mainRoleFilteredCount",
  "mainDuplicateCandidateCount",
  "mainMissingDescriptionCount",
  "mainMissingEvidenceCount",
  "mainInvalidCandidateCount",
  "mainHardRestrictionPrefilteredCount",
  "mainPreferenceMatchedCount",
  "mainPreferenceUnmatchedCount",
  "mainPreferenceMultiMatchedCount",
  "mainPreferenceEvidenceMissingCount",
  "mainCandidateLimit",
  "mainCandidateCountBeforeLimit",
  "mainCandidateLimitDropCount",
  "mainCandidateCountAfterLimit",
  "mainCandidatesSentToSafetyCount",
  "mainResponseStatusKnown",
  "mainIncompleteStatusKnown",
  "mainOutputTokenLimitReached",
  "mainRefusalCount",
  "mainRawOutputCount"
];

for (const field of requiredMainFields) {
  assert(mainAi.includes(`${field}:`), `Main-AI production trace must define ${field}`);
  assert(route.includes(`${field}:`), `Production route trace must include ${field}`);
}

assert(
  mainAi.includes("const rawCompactJson = JSON.parse(stripJsonFence(response.output_text ?? \"{}\"));") &&
    mainAi.includes("const compactJson = limitCompactDishesToCandidateLimit(rawCompactJson, candidateLimit);") &&
    mainAi.includes("const compactParsed = MainDishAICompactResponseSchema.parse(compactJson);"),
  "Main-AI funnel must observe the existing raw parse, active candidate limit, and schema parse order"
);
assert(
  mainAi.includes("mainFunnelDiagnostics.mainParsedCandidateCount = compactParsed.dishes.length") &&
    mainAi.includes("mainFunnelDiagnostics.mainNormalizedCandidateCount = parsed.safeCandidates.length"),
  "Main-AI funnel must count parsed and normalized candidates"
);
assert(
  mainAi.includes("mainCandidateCountBeforeLimit: rawOutputItemCount") &&
    mainAi.includes("mainCandidateLimitDropCount: Math.max(0, rawOutputItemCount - candidateCountAfterLimit)") &&
    mainAi.includes("mainCandidateCountAfterLimit: candidateCountAfterLimit") &&
    mainAi.includes("mainCandidateLimit: candidateLimit"),
  "Main-AI funnel must count before/after limit and limit drops against the active limit"
);
assert(
  mainAi.includes("mainCandidatesSentToSafetyCount: count") &&
    mainAi.includes("withSafetyCandidateCount(mainFunnelDiagnostics, verifierCandidates.length)"),
  "Main-AI funnel must count candidates sent to Safety"
);
assert(
  mainAi.includes("mainPreferenceMatchedCount = compactParsed.dishes") &&
    mainAi.includes("mainPreferenceUnmatchedCount =") &&
    mainAi.includes("mainPreferenceEvidenceMissingCount"),
  "Main-AI funnel must expose only preference match counts"
);
assert(
  mainAi.includes("countDuplicateCompactDishNames(rawDishes)") &&
    mainAi.includes("mainMissingNameCount: missingNameCount") &&
    mainAi.includes("mainInvalidStructureCount: rawDishes.filter"),
  "Main-AI funnel must count duplicate names, missing names, and invalid structures"
);
assert(
  mainAi.includes("mainEmptyResponseCount: rawOutputItemCount === 0 ? 1 : 0") &&
    mainAi.includes("mainTruncatedOrIncompleteCount: isMainResponseIncomplete(response)") &&
    mainAi.includes("mainOutputTokenLimitReached: isOutputTokenLimitReached(response)") &&
    mainAi.includes("mainRefusalCount: countMainResponseRefusals(response)"),
  "Main-AI funnel must expose available non-sensitive response metadata"
);

const mainAiCreateCallCount = (mainAi.match(/client\.responses\.create\(/g) ?? []).length;
assert(mainAiCreateCallCount === 1, "Main-AI funnel diagnostics must not add Main-AI calls");
const verifySafetyCallCount = (mainAi.match(/verifyRecommendationSafetyAI\(/g) ?? []).length;
assert(verifySafetyCallCount === 1, "Main-AI funnel diagnostics must not add Safety-AI calls");

const traceTypeStart = route.indexOf("type ProductionRequestTraceFields = {");
const traceTypeEnd = route.indexOf("};", traceTypeStart);
const traceType = route.slice(traceTypeStart, traceTypeEnd);

for (const forbidden of [
  "console.info(`[gustaro-main-ai",
  "nameOriginal:",
  "descriptionOriginal:",
  "sourceEvidence:",
  "matchedPreferenceValue:",
  "profile.primaryLikes",
  "profile.customExclusions",
  "profile.allergens",
  "source.text",
  "prompt:",
  "response_format",
  "json_schema"
]) {
  assert(!traceType.includes(forbidden), `Production trace must not expose forbidden content marker ${forbidden}`);
}

assert(
  route.includes("process.env.GUSTARO_PRODUCTION_REQUEST_TRACE !== \"true\"") &&
    route.includes("console.info(`[gustaro-production-request-trace]"),
  "Main-AI funnel fields must stay inside the existing production trace line"
);
assert(
  !mainAi.includes("sort(") ||
    mainAi.includes("rankRecommendationsByPreferenceAttribution(recommendations)") ||
    mainAi.includes("rankRecommendationsByPreferenceAttribution(parsed.recommendations)"),
  "Main-AI funnel diagnostics must not introduce candidate ordering changes"
);

console.log("main-ai-candidate-funnel-regression: passed");
