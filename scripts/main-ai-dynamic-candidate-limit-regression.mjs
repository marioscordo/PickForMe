import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8");
const schemas = fs.readFileSync("apps/api/src/ai/twoStepRecommendationSchemas.ts", "utf8");
const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8");

assert(mainAi.includes("const MAIN_DISH_DEFAULT_CANDIDATE_LIMIT = 10;"), "default Main-AI candidate limit must be 10");
assert(mainAi.includes("const MAIN_DISH_HARD_RESTRICTION_CANDIDATE_LIMIT = 15;"), "hard-restriction Main-AI candidate limit must be 15");
assert(
  mainAi.includes("const candidateLimit = getMainDishCandidateLimit(profile);"),
  "Main-AI path must compute one central candidate limit from the current profile"
);
assert(
  mainAi.includes("return hasActiveMainDishHardRestrictions(profile)") &&
    mainAi.includes("? MAIN_DISH_HARD_RESTRICTION_CANDIDATE_LIMIT") &&
    mainAi.includes(": MAIN_DISH_DEFAULT_CANDIDATE_LIMIT"),
  "candidate limit must be selected from one central hard-restriction predicate"
);
assert(
  mainAi.includes("arrayValue(profile.allergens).length > 0 ||") &&
    mainAi.includes("arrayValue(profile.customExclusions).length > 0"),
  "candidate limit must depend only on active allergens or active hard exclusions"
);
assert(!mainAi.includes("primaryLikes).length > 0") && !mainAi.includes("secondaryLikes"), "preferences must not affect the candidate limit");

assert(
  mainAi.includes("prompt: buildMainDishPrompt({") &&
    mainAi.includes("candidateLimit"),
  "prompt builder must receive the central candidate limit"
);
assert(
  mainAi.includes("`- Liefere bis zu ${candidateLimit} unterschiedliche Gerichte aus dem angeforderten Rollenraum.`") &&
    mainAi.includes("`- Liefere maximal ${candidateLimit} Compact-Dishes.`"),
  "Main-AI prompt must name the active candidate limit as a maximum"
);
assert(
  mainAi.includes("buildActivePreferenceSearchAssignment(activePreferences, candidateLimit)") &&
    mainAi.includes("buildRequestedDishRoleAssignment(requestedDishRoles, candidateLimit)") &&
    mainAi.includes("aktives_compact_dish_limit: candidateLimit"),
  "all prompt-side maximum references must use the same candidate limit"
);

assert(
  schemas.includes('.max(15, "Main AI compact response must not contain more than 15 dishes")'),
  "compact schema must technically accept the 15-candidate hard-restriction case"
);
assert(
  mainAi.includes("const compactJson = limitCompactDishesToCandidateLimit(rawCompactJson, candidateLimit);") &&
    mainAi.includes("dishes: response.dishes.slice(0, candidateLimit)") &&
    mainAi.includes("mainCandidateLimit: candidateLimit"),
  "active candidate limit must constrain parsed payload and production funnel trace"
);
assert(
  mainAi.includes("mainCandidateLimitDropCount: Math.max(0, rawOutputItemCount - candidateCountAfterLimit)") &&
    mainAi.includes("mainCandidateCountAfterLimit: candidateCountAfterLimit") &&
    mainAi.includes("mainCandidatesSentToSafetyCount: count"),
  "funnel counters must remain consistent with the active limit and Safety handoff"
);

assert(
  mainAi.includes("recommendations: z.array(MainDishAIRecommendationSchema).max(3)") ||
    schemas.includes("recommendations: z.array(MainDishAIRecommendationSchema).max(3)"),
  "final recommendation contract must remain capped at 3"
);
assert(count(mainAi, "client.responses.create(request") === 1, "dynamic candidate limit must not add Main-AI calls");
assert(count(mainAi, "verifyRecommendationSafetyAI({") === 1, "dynamic candidate limit must not add Safety-AI calls");
assert(
  route.includes("buildProductionMainFunnelTraceFields") &&
    route.includes("mainCandidateLimit: productionTrace?.mainCandidateLimit ?? 0"),
  "route must keep forwarding the Main-AI funnel trace candidate limit"
);

for (const forbidden of [
  "aktive Kandidatenlimit ist deine Zielmenge",
  "exakt das aktive Kandidatenlimit",
  "musst du exakt",
  "nicht nach den ersten passenden Gerichten stoppen",
  "weiter suchen, bis das aktive Kandidatenlimit erreicht ist"
]) {
  assert(!mainAi.includes(forbidden), `Stage-2 target prompt rule must not be introduced yet: ${forbidden}`);
}

console.log("main-ai-dynamic-candidate-limit-regression: passed");
