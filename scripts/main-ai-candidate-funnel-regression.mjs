import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8").replace(/\r\n/g, "\n");
const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8").replace(/\r\n/g, "\n");

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

const parseSequence = [
  "const rawCompactJson = JSON.parse(stripJsonFence(response.output_text ?? \"{}\"));",
  "const compactJson = limitCompactDishesToCandidateLimit(rawCompactJson, candidateLimit);",
  "const mainFunnelDiagnostics = buildMainAICandidateFunnelDiagnostics({",
  "const compactParsed = parseMainDishCompactResponse(compactJson, usesStarterSaladRoleClassification);",
  "mainFunnelDiagnostics.mainParsedCandidateCount = compactParsed.dishes.length",
  "await repairMissingCompactTranslatedDescriptions({",
  "validateCompactDescriptionTranslationContract(compactParsed, targetLocale, runId);",
  "parsed = buildMainDishResponseFromCompactDishes({",
  "const verifierSafe = await applyMainDishVerifierSafety(parsed, profile, runId, signal, mainFunnelDiagnostics);"
];
let previousIndex = -1;
for (const marker of parseSequence) {
  const index = mainAi.indexOf(marker);
  assert(index > previousIndex, `Main-AI funnel must preserve parse order around ${marker}`);
  previousIndex = index;
}
assert(
  mainAi.includes("const usesStarterSaladRoleClassification = isStarterSaladRoleClassificationEnabled(requestedDishRoles);") &&
    mainAi.includes("? StarterSaladMainDishAICompactResponseSchema.parse(value)") &&
    mainAi.includes(": MainDishAICompactResponseSchema.parse(value)"),
  "Main-AI funnel must use the role-aware compact parser with unchanged main schema and starter/salad schema branch"
);
assert(
  (mainAi.match(/parseMainDishCompactResponse\(compactJson, usesStarterSaladRoleClassification\)/g) ?? []).length === 1,
  "Main-AI funnel must parse compact candidates exactly once"
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

const openAiCreateCallCount = (mainAi.match(/client\.responses\.create\(/g) ?? []).length;
assert(openAiCreateCallCount === 2, "Main-AI funnel must keep exactly the Main-AI request and description repair request");
assert(mainAi.includes('phase: "api.main_ai_request"'), "Main-AI funnel diagnostics must keep the Main-AI request diagnostic");
assert(mainAi.includes('phase: "api.description_translation_repair_request"'), "Main-AI funnel must allow the separate description repair request diagnostic");
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
