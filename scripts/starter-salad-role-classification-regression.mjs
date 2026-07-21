import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function between(value, startMarker, endMarker) {
  const start = value.indexOf(startMarker);
  assert(start >= 0, `Missing start marker: ${startMarker}`);
  const end = value.indexOf(endMarker, start + startMarker.length);
  assert(end >= 0, `Missing end marker: ${endMarker}`);
  return value.slice(start, end);
}

function countMatches(value, pattern) {
  return (value.match(pattern) ?? []).length;
}

const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8");
const schemas = fs.readFileSync("apps/api/src/ai/twoStepRecommendationSchemas.ts", "utf8");
const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8");

const mainCompactDishSchema = between(
  schemas,
  "export const MainDishAICompactDishSchema = z.object({",
  "export const MainDishAICompactResponseSchema = z.object({"
);
assert(!mainCompactDishSchema.includes("dishRole"), "Main compact dish schema must not add dishRole");
assert(!mainCompactDishSchema.includes("isStandaloneDish"), "Main compact dish schema must not add isStandaloneDish");

const starterSchema = between(
  schemas,
  "export const StarterSaladMainDishAICompactDishSchema = MainDishAICompactDishSchema.extend({",
  "export const CommittedMainDishRecommendationSchema = z.object({"
);
assert(starterSchema.includes("dishRole: z.unknown().optional()"), "Starter/salad diagnostic schema must tolerate dishRole");
assert(starterSchema.includes("isStandaloneDish: z.unknown().optional()"), "Starter/salad diagnostic schema must tolerate isStandaloneDish");
assert(starterSchema.includes("StarterSaladMainDishAICompactResponseSchema"), "Starter/salad response schema must be separate");
assert(starterSchema.includes(".max(15"), "Starter/salad schema must preserve candidate max");

const roleAssignment = between(
  mainAi,
  "function buildRequestedDishRoleAssignment",
  "function buildPreferredDishRoleAssignment"
);
const mainBranchMarker = "  return {\r\n    roles: [\"main\"],";
const starterBranch = between(
  roleAssignment,
  "if (roles.includes(\"starter\") || roles.includes(\"salad\"))",
  mainBranchMarker
);
const mainBranch = roleAssignment.slice(roleAssignment.indexOf(mainBranchMarker));

for (const required of [
  "Klassifiziere jeden Kandidaten zusaetzlich mit dishRole und isStandaloneDish",
  "dishRole muss exakt einer dieser Werte sein: starter, salad, side, soup, other",
  "Beilagensalat ist dishRole side und isStandaloneDish false",
  "Wende wegen dishRole oder isStandaloneDish keine Filterung, Sortierung, Priorisierung oder Entfernung an"
]) {
  assert(starterBranch.includes(required), `Starter/salad prompt must include diagnostic rule: ${required}`);
  assert(!mainBranch.includes(required), `Main prompt branch must not include diagnostic rule: ${required}`);
}
assert(mainBranch.includes("Der aktive Rollenraum ist ausschliesslich main."), "Main prompt branch must remain the main role branch");

assert(
  mainAi.includes("const usesStarterSaladRoleClassification = isStarterSaladRoleClassificationEnabled(requestedDishRoles);"),
  "Starter/salad diagnostic switch must be derived from requested roles"
);
assert(
  mainAi.includes("return roles.includes(\"starter\") || roles.includes(\"salad\");"),
  "Diagnostic switch must only enable for starter/salad roles"
);
assert(
  mainAi.includes("? StarterSaladMainDishAICompactResponseSchema.parse(value)") &&
    mainAi.includes(": MainDishAICompactResponseSchema.parse(value)"),
  "Main and starter/salad parsing must use separate schema branches"
);

const diagnosticHelper = between(
  mainAi,
  "function applyStarterSaladRoleClassificationDiagnostics",
  "function isStarterSaladDiagnosticRole"
);
for (const field of [
  "mainStarterRoleCount",
  "mainSaladRoleCount",
  "mainSideRoleCount",
  "mainSoupRoleCount",
  "mainOtherRoleCount",
  "mainStandaloneDishCount",
  "mainNonStandaloneDishCount",
  "mainMissingRoleClassificationCount",
  "mainInvalidRoleClassificationCount"
]) {
  assert(mainAi.includes(`${field}?: number`), `Production trace type must expose optional ${field}`);
  assert(route.includes(`${field}?: number`), `Route trace type must expose optional ${field}`);
  assert(route.includes(field), `Route trace must include ${field} when present`);
}
assert(diagnosticHelper.includes("if (!enabled)"), "Role diagnostics must no-op outside starter/salad mode");
assert(diagnosticHelper.includes("return;"), "Role diagnostics must return without side effects when disabled");
assert(diagnosticHelper.includes("mainMissingRoleClassificationCount += 1"), "Missing classifications must be counted");
assert(diagnosticHelper.includes("mainInvalidRoleClassificationCount += 1"), "Invalid classifications must be counted");
assert(!diagnosticHelper.includes("throw"), "Invalid role diagnostics must not throw");
assert(!diagnosticHelper.includes("filter("), "Role diagnostics must not filter candidates");
assert(!diagnosticHelper.includes("sort("), "Role diagnostics must not sort candidates");

assert(
  route.includes("...(productionTrace?.mainStarterRoleCount !== undefined ? {") && route.includes(": {})"),
  "Production role counts must only be emitted when starter/salad diagnostics are present"
);

const traceFields = between(route, "type ProductionRequestTraceFields = {", "};");
for (const forbidden of [
  "nameOriginal:",
  "descriptionOriginal:",
  "sourceEvidence:",
  "candidateId:",
  "profile.primaryLikes",
  "profile.customExclusions",
  "profile.allergens",
  "source.text",
  "prompt:",
  "response_format",
  "json_schema"
]) {
  assert(!traceFields.includes(forbidden), `Production trace type must not expose forbidden content marker ${forbidden}`);
}

assert(countMatches(mainAi, /client\.responses\.create\(/g) === 1, "Role diagnostics must not add Main-AI calls");
assert(countMatches(mainAi, /verifyRecommendationSafetyAI\(/g) === 1, "Role diagnostics must not add Safety-AI calls");
assert(!mainAi.includes("rankRecommendationsByPreferenceAttribution(compactParsed"), "Role diagnostics must not change ranking inputs");
assert(!mainAi.includes("applyStarterSaladRoleClassificationDiagnostics(parsed"), "Role diagnostics must not run after final selection");

console.log("starter-salad-role-classification-regression: passed");