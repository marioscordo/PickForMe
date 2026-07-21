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

const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8");
const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8");
const schemas = fs.readFileSync("apps/api/src/ai/twoStepRecommendationSchemas.ts", "utf8");
const mobileHook = fs.readFileSync("apps/mobile/src/hooks/useAnalyzeMenu.ts", "utf8");

const mainAiCatch = between(
  route,
  "  } catch (error) {\n    const controlledError = mapStarterSaladInvalidMainAiSchemaError(error, requestedDishRoles);",
  "  const gatekeeperStartedAt = Date.now();"
);
assert(
  mainAiCatch.includes("logTwoStepMainError") &&
    mainAiCatch.includes("error: controlledError") &&
    mainAiCatch.includes("throw controlledError;"),
  "Main-AI route catch must log and throw the controlled starter/salad schema error"
);
assert(
  mainAiCatch.includes("getAnalyzeOpsErrorClass(controlledError)") &&
    mainAiCatch.includes("getAnalyzeOpsDiagnosticReason(controlledError)"),
  "Main-AI route diagnostics must use the controlled error"
);

const mapper = between(
  route,
  "function mapStarterSaladInvalidMainAiSchemaError",
  "function attachAnalyzeOpsDiagnosticReason"
);
for (const required of [
  "if (!isStarterSaladRoleClassificationRequest(roles))",
  "return error;",
  "error instanceof SyntaxError",
  'error.message !== "AI_RESPONSE_INVALID_SCHEMA"',
  "new AppError(",
  "422",
  '"NO_SAFE_RECOMMENDATIONS"',
  "attachAnalyzeOpsDiagnosticReason(controlledError, \"main_ai_invalid_starter_salad_schema\")",
  "return controlledError;"
]) {
  assert(mapper.includes(required), `Starter/salad invalid schema mapper must include ${required}`);
}
assert(
  mapper.includes('roles.includes("starter") || roles.includes("salad")'),
  "Controlled schema error must be gated to starter/salad roles"
);
assert(
  !mapper.includes('roles.includes("main")'),
  "Main-only requests must not be converted by the starter/salad schema mapper"
);
assert(
  !route.includes('new AppError(\n    500,\n    "AI_RESPONSE_INVALID"') ||
    !mapper.includes('"AI_RESPONSE_INVALID"'),
  "Starter/salad invalid schema mapper must not use the technical 500 AI_RESPONSE_INVALID code"
);

assert(
  /if \(attempt === 1 && isInvalidAiResponseError\(error\)\) \{\s*continue;\s*\}/.test(mainAi),
  "Main-AI retry behavior must remain one retry for invalid AI responses"
);
assert(
  mainAi.includes('throw toSyntaxError(error);'),
  "Main-AI must still throw the normalized schema SyntaxError after retry exhaustion"
);
assert(
  countMatches(mainAi, /client\.responses\.create\(/g) === 1,
  "Invalid schema handling must not add Main-AI calls"
);
assert(
  countMatches(mainAi, /verifyRecommendationSafetyAI\(/g) === 1,
  "Invalid schema handling must not add Safety-AI calls"
);

const starterSchema = between(
  schemas,
  "export const StarterSaladMainDishAICompactDishSchema = MainDishAICompactDishSchema.extend({",
  "export const CommittedMainDishRecommendationSchema = z.object({"
);
assert(starterSchema.includes("dishRole: z.unknown().optional()"), "dishRole must remain optional for this stage");
assert(starterSchema.includes("isStandaloneDish: z.unknown().optional()"), "isStandaloneDish must remain optional for this stage");

const mainCompactDishSchema = between(
  schemas,
  "export const MainDishAICompactDishSchema = z.object({",
  "export const MainDishAICompactResponseSchema = z.object({"
);
assert(!mainCompactDishSchema.includes("dishRole"), "Main compact schema must remain without dishRole");
assert(!mainCompactDishSchema.includes("isStandaloneDish"), "Main compact schema must remain without isStandaloneDish");

assert(mobileHook.includes('case "NO_SAFE_RECOMMENDATIONS"'), "Mobile must keep explicit NO_SAFE_RECOMMENDATIONS handling");
assert(mobileHook.includes("error.status && error.status >= 500"), "Mobile must keep technical handling for unexpected 5xx errors");

console.log("starter-salad-invalid-schema-error-regression: passed");
