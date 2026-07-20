import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const route = read("apps/api/app/api/analyze-menu/route.ts");
const mainAi = read("apps/api/src/ai/recommendMainDishesAI.ts");

assert(
  route.includes('process.env.GUSTARO_PRODUCTION_REQUEST_TRACE !== "true"'),
  "Production request trace must be disabled unless the flag is exactly true"
);
assert(
  route.includes("[gustaro-production-request-trace]"),
  "Production request trace must use the expected compact log marker"
);
assert(
  route.includes("type ProductionRequestTraceFields = {"),
  "Production request trace must use a constrained field type"
);

const traceTypeStart = route.indexOf("type ProductionRequestTraceFields = {");
const traceTypeEnd = route.indexOf("};", traceTypeStart);
const traceType = route.slice(traceTypeStart, traceTypeEnd);
const allowedFields = [
  "requestId",
  "runId",
  "analysisMode",
  "sourceKind",
  "sourceHash",
  "primaryLikeCount",
  "allergenCount",
  "customExclusionCount",
  "restrictionCount",
  "hasLactoseCanonicalRule",
  "supportsUncertainReviewCandidates",
  "uncertainReviewFeatureEnabled",
  "mainCandidateCount",
  "safeCount",
  "uncertainCount",
  "conflictCount",
  "invalidCount",
  "finalSafeCount",
  "reviewCandidateCount",
  "reviewReturnedCount",
  "recommendationResultType",
  "httpStatus",
  "totalDurationMs"
];

for (const field of allowedFields) {
  assert(traceType.includes(`${field}:`), `Trace field missing: ${field}`);
}

const forbiddenTraceFields = [
  "dishName",
  "nameOriginal",
  "descriptionOriginal",
  "translatedDescription",
  "priceRaw",
  "primaryLikes",
  "customExclusions",
  "allergens",
  "menuText",
  "prompt",
  "rawResponse",
  "sourceUrl",
  "urls",
  "email",
  "userId",
  "token",
  "authorization",
  "imageBase64"
];

for (const field of forbiddenTraceFields) {
  assert(!traceType.includes(`${field}:`), `Sensitive trace field must not be exposed: ${field}`);
}

assert(
  route.includes('recommendationResultType: "standard"') &&
    route.includes('recommendationResultType: "uncertain_review"') &&
    route.includes("recommendationResultType: error.code"),
  "Trace must cover standard, uncertain_review, and error result types"
);
assert(
  route.includes('httpStatus: 200') &&
    route.includes('httpStatus: error.status'),
  "Trace must include HTTP status for success and error paths"
);
assert(
  route.includes("reviewReturnedCount: allergySafeRecommendations.length") &&
    route.includes("reviewReturnedCount: 0"),
  "Trace must include actual review returned count"
);
assert(
  route.includes('createHash("sha256").update(payload).digest("hex").slice(0, 16)'),
  "Source hash must be SHA-256 and truncated"
);
assert(
  route.includes("markProductionRequestTraceLogged(error)") &&
    route.includes("!isProductionRequestTraceLogged(error)"),
  "Error traces must be guarded against duplicate request trace lines"
);
assert(
  mainAi.includes("productionTrace?:") &&
    mainAi.includes("buildProductionSafetyTrace") &&
    mainAi.includes('reason === "uncertain"') &&
    mainAi.includes('reason === "conflict"') &&
    mainAi.includes('reason === "invalid_response"'),
  "Main AI path must expose real safety validation counters for the trace"
);

const verifySafetyCallCount = (mainAi.match(/verifyRecommendationSafetyAI\(/g) ?? []).length;
assert(verifySafetyCallCount === 1, "Production request trace must not add a second Safety call");
const mainAiCreateCallCount = (mainAi.match(/client\.responses\.create\(/g) ?? []).length;
assert(mainAiCreateCallCount === 1, "Production request trace must not add a second Main-AI call");

console.log("production-request-trace-regression: passed");
