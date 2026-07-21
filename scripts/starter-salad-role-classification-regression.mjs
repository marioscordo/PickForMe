import fs from "node:fs";
import { z } from "zod";

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
assert(
  starterSchema.includes('dishRole: z.enum(["starter", "salad", "side", "soup", "other"])'),
  "Starter/salad diagnostic schema must require dishRole as the exact role enum"
);
assert(starterSchema.includes("isStandaloneDish: z.boolean()"), "Starter/salad diagnostic schema must require isStandaloneDish as boolean");
assert(!starterSchema.includes("dishRole: z.unknown().optional()"), "Starter/salad dishRole must no longer be optional unknown");
assert(!starterSchema.includes("isStandaloneDish: z.unknown().optional()"), "Starter/salad isStandaloneDish must no longer be optional unknown");
assert(!starterSchema.includes(".nullable()"), "Starter/salad role fields must not be nullable");
assert(!starterSchema.includes(".default("), "Starter/salad role fields must not use defaults");
assert(starterSchema.includes("StarterSaladMainDishAICompactResponseSchema"), "Starter/salad response schema must be separate");
assert(starterSchema.includes(".max(15"), "Starter/salad schema must preserve candidate max");

const roleAssignment = between(
  mainAi,
  "function buildRequestedDishRoleAssignment",
  "function buildPreferredDishRoleAssignment"
);
const normalizedRoleAssignment = roleAssignment.replace(/\r\n/g, "\n");
const mainBranchMarker = "  return {\n    roles: [\"main\"],";
const starterBranch = between(
  normalizedRoleAssignment,
  "if (roles.includes(\"starter\") || roles.includes(\"salad\"))",
  mainBranchMarker
);
const mainBranch = normalizedRoleAssignment.slice(normalizedRoleAssignment.indexOf(mainBranchMarker));

for (const required of [
  "Klassifiziere jeden Kandidaten zusaetzlich mit dishRole und isStandaloneDish",
  "dishRole muss exakt einer dieser Werte sein: starter, salad, side, soup, other",
  "Beilagensalat ist dishRole side und isStandaloneDish false",
  "Jeder Kandidat muss die Felder dishRole und isStandaloneDish exakt mit diesen Feldnamen enthalten",
  "keine alternativen Schreibweisen",
  "keine freien Rollenwerte",
  "keine Kandidatenausgabe ohne beide Felder",
  "Beispiel fuer vollstaendige Rollenklassifikation im JSON",
  '\\"dishRole\\":\\"starter\\",\\"isStandaloneDish\\":true',
  '\\"dishRole\\":\\"salad\\",\\"isStandaloneDish\\":true',
  '\\"dishRole\\":\\"side\\",\\"isStandaloneDish\\":false',
  '\\"dishRole\\":\\"soup\\",\\"isStandaloneDish\\":true',
  "Gib keine Prosa ausserhalb des JSON aus",
  "Wende wegen dishRole oder isStandaloneDish keine Filterung, Sortierung, Priorisierung oder Entfernung an"
]) {
  assert(starterBranch.includes(required), `Starter/salad prompt must include diagnostic rule: ${required}`);
  assert(!mainBranch.includes(required), `Main prompt branch must not include diagnostic rule: ${required}`);
}
assert(!starterBranch.includes("dish_role"), "Starter/salad prompt must not introduce alternative dish_role spelling");
assert(!starterBranch.includes("standaloneDish"), "Starter/salad prompt must not introduce alternative standaloneDish spelling");
assert(!starterBranch.includes("role:"), "Starter/salad prompt must not introduce alternative role field");
assert(!starterBranch.includes("Filtere side"), "Starter/salad prompt must not filter side candidates");
assert(!starterBranch.includes("Entferne side"), "Starter/salad prompt must not remove side candidates");
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

const roleClassificationSchema = z.object({
  dishRole: z.enum(["starter", "salad", "side", "soup", "other"]),
  isStandaloneDish: z.boolean()
});
assert(roleClassificationSchema.safeParse({ dishRole: "starter", isStandaloneDish: true }).success, "Valid starter role classification must parse");
assert(roleClassificationSchema.safeParse({ dishRole: "salad", isStandaloneDish: true }).success, "Valid salad role classification must parse");
assert(roleClassificationSchema.safeParse({ dishRole: "side", isStandaloneDish: false }).success, "Valid side role classification must parse");
assert(roleClassificationSchema.safeParse({ dishRole: "soup", isStandaloneDish: true }).success, "Valid soup role classification must parse");
assert(roleClassificationSchema.safeParse({ dishRole: "other", isStandaloneDish: true }).success, "Valid other role classification must parse");
assert(!roleClassificationSchema.safeParse({ isStandaloneDish: true }).success, "Missing dishRole must fail");
assert(!roleClassificationSchema.safeParse({ dishRole: "starter" }).success, "Missing isStandaloneDish must fail");
assert(!roleClassificationSchema.safeParse({ dishRole: "appetizer", isStandaloneDish: true }).success, "Invalid dishRole must fail");
assert(!roleClassificationSchema.safeParse({ dishRole: "starter", isStandaloneDish: "true" }).success, "Non-boolean isStandaloneDish must fail");

console.log("starter-salad-role-classification-regression: passed");
