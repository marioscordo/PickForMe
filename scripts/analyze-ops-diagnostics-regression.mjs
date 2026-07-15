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

const diagnostics = read("apps/api/src/ai/twoStepRecommendationDiagnostics.ts");
const route = read("apps/api/app/api/analyze-menu/route.ts");
const mainAi = read("apps/api/src/ai/recommendMainDishesAI.ts");
const attributionAi = read("apps/api/src/ai/verifyAttributionEvidenceAI.ts");
const attributionValidator = read("apps/api/src/recommendation/attributionValidator.ts");

const opsSources = [diagnostics, route, mainAi, attributionAi].join("\n");

assert(
  diagnostics.includes('process.env.GUSTARO_ANALYZE_OPS_DIAGNOSTICS === "1"'),
  "ops diagnostics must be guarded by the dedicated production-safe flag"
);
assert(
  diagnostics.includes("[GUSTARO_ANALYZE_OPS]"),
  "ops diagnostics must use a distinct log marker"
);
assert(
  !diagnostics.includes("GUSTARO_ANALYZE_DIAGNOSTICS === \"1\"") ||
    diagnostics.includes("GUSTARO_ANALYZE_OPS_DIAGNOSTICS === \"1\""),
  "ops diagnostics must not depend on the detailed dev diagnostics flag"
);

for (const phase of [
  "validation",
  "source_fetch",
  "main_ai_request",
  "main_ai_parse",
  "attribution_evidence",
  "safety_verifier",
  "gatekeeper",
  "mapper",
  "total"
]) {
  assert(opsSources.includes(`phase: "${phase}"`), `ops diagnostics must include ${phase}`);
}

for (const safeField of [
  "runId",
  "sourceKind",
  "responseMode",
  "requestedDishRoles",
  "preferredDishRole",
  "requestKind",
  "durationMs",
  "candidateCount",
  "recommendationCount",
  "httpStatus",
  "errorCode",
  "errorClass",
  "diagnosticReason"
]) {
  assert(opsSources.includes(safeField), `ops diagnostics should include safe field ${safeField}`);
}

for (const forbiddenField of [
  "restaurantName",
  "dishName",
  "nameOriginal",
  "descriptionOriginal",
  "sourceUrl",
  "menuText",
  "profileEvidence",
  "evidenceSource",
  "profileValue",
  "matchedProfileValue",
  "allergens",
  "customExclusions",
  "primaryLikes",
  "prompt",
  "output_text",
  "apiKey",
  "token"
]) {
  assert(
    !hasForbiddenOpsField(opsSources, forbiddenField),
    `ops diagnostics must not log forbidden field ${forbiddenField}`
  );
}

for (const reason of [
  "no_active_profile_match",
  "no_evidence_checks",
  "evidence_invalid",
  "evidence_uncertain",
  "no_valid_attribution_after_backfill",
  "main_ai_no_safe_candidates",
  "safety_removed_all",
  "gatekeeper_removed_all"
]) {
  assert(opsSources.includes(reason) || attributionValidator.includes(reason), `missing diagnostic reason ${reason}`);
}

assert(
  route.includes('preferredDishRole === "starter" && roles.includes("starter") ? "embedded" : "topLevel"') ||
    mainAi.includes('preferredDishRole === "starter" && (roles ?? []).includes("starter") ? "embedded" : "topLevel"'),
  "embedded requests must be derived from roles and preferredDishRole"
);

assert(
  attributionValidator.includes("attributionFailureReason") &&
    mainAi.includes("ATTRIBUTION_NOT_CONFIRMED:${attributionValidated.attributionFailureReason"),
  "attribution failure reasons must be propagated as controlled internal codes"
);

console.log("analyze ops diagnostics regression passed");

function hasForbiddenOpsField(source, field) {
  const marker = "logAnalyzeOpsDiagnostic({";
  let index = source.indexOf(marker);

  while (index >= 0) {
    const end = source.indexOf("});", index);
    const block = source.slice(index, end >= 0 ? end : index + 800);

    if (new RegExp(`\\b${field}\\b`).test(block)) {
      return true;
    }

    index = source.indexOf(marker, index + marker.length);
  }

  return false;
}
