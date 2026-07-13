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

function parseJson(relativePath) {
  return JSON.parse(read(relativePath));
}

const de = parseJson("apps/mobile/src/content/mobileContent.de-DE.json");
const en = parseJson("apps/mobile/src/content/mobileContent.en-US.json");

for (const [locale, content, expectedLabels] of [
  ["de-DE", de, ["Vorspeisen und Salate", "Hauptspeise"]],
  ["en-US", en, ["Starters and salads", "Main course"]]
]) {
  const modes = content.recommendationModes;
  assert(Array.isArray(modes), `${locale}: recommendationModes missing`);
  assert(modes.length === 2, `${locale}: expected exactly two modes`);
  assert(modes[0]?.value === "starters_and_salads", `${locale}: first mode must be starters_and_salads`);
  assert(modes[1]?.value === "main_course", `${locale}: second mode must be main_course`);
  assert(modes[0]?.label === expectedLabels[0], `${locale}: first label mismatch`);
  assert(modes[1]?.label === expectedLabels[1], `${locale}: second label mismatch`);
  assert(!("situations" in content), `${locale}: old situations key must not be present`);
  assert(content.recommendation.startersAndSaladsButton === expectedLabels[0], `${locale}: nested starters/salads action mismatch`);
}

const mobileMode = read("apps/mobile/src/types/recommendationMode.ts");
assert(mobileMode.includes('return mode === "starters_and_salads" ? ["starter", "salad"] : ["main"];'), "mobile mode payload mapping missing");

const selector = read("apps/mobile/src/components/pick/SituationSelector.tsx");
assert(selector.includes("RecommendationModeSelector"), "selector export missing");
assert(selector.includes("content.recommendationModes"), "selector must read recommendationModes");
assert(selector.includes('width: "100%"'), "selector options must be full width");
assert(!selector.includes("flexWrap"), "selector must not keep the old wrapping grid");
assert(!selector.includes("flexBasis"), "selector must not keep the old 2x2 basis");

const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
assert(pickScreen.includes("requestedDishRolesForMode(recommendationMode)"), "PickScreen must send requested dish roles");
assert(!pickScreen.includes("setSituation"), "PickScreen must not keep active situation state");
assert(!pickScreen.includes("<SituationSelector"), "PickScreen must not render the old situation selector");

const useAnalyzeMenu = read("apps/mobile/src/hooks/useAnalyzeMenu.ts");
assert(useAnalyzeMenu.includes("requestedDishRoles: RequestedDishRole[]"), "useAnalyzeMenu must accept requestedDishRoles");
assert(!useAnalyzeMenu.includes("appetiteMood: situation"), "useAnalyzeMenu must not write mood into profile payload");

const apiClient = read("apps/mobile/src/api/pickformeApi.ts");
assert(apiClient.includes("requestedDishRoles: args.requestedDishRoles"), "mobile API payload must include requestedDishRoles");
assert(!apiClient.includes("requestStarterPairings"), "mobile API client must not expose starter pairing call");
assert(!apiClient.includes('"/api/starter-pairings"'), "mobile API client must not call starter-pairings");

const recommendationCard = read("apps/mobile/src/components/pick/RecommendationCard.tsx");
assert(!recommendationCard.includes("starterSearch"), "RecommendationCard must not render starter search states");
assert(!recommendationCard.includes("requestStarterPairings"), "RecommendationCard must not call starter pairings");
assert(!recommendationCard.includes("targetDishId"), "RecommendationCard must not send targetDishId");
assert(recommendationCard.includes("showStartersAndSaladsAction"), "RecommendationCard must gate nested action by main-mode prop");
assert(recommendationCard.includes('requestedDishRoles: ["starter", "salad"]'), "RecommendationCard nested action must reuse starter/salad analyze roles");
assert(recommendationCard.includes("nestedLoadingDishIdsRef"), "RecommendationCard must guard fast double taps");

const apiTypes = read("apps/api/src/types/api.ts");
assert(apiTypes.includes('export type RequestedDishRole = "starter" | "salad" | "main";'), "API requested role type missing");
assert(apiTypes.includes("requestedDishRoles?: RequestedDishRole[]"), "AnalyzeMenuRequest must include requestedDishRoles");

const analyzeRoute = read("apps/api/app/api/analyze-menu/route.ts");
assert(analyzeRoute.includes("normalizeRequestedDishRoles(body.requestedDishRoles)"), "analyze route must normalize requested roles");
assert(analyzeRoute.includes('return ["starter", "salad"];'), "analyze route must normalize starter/salad role space");
assert(analyzeRoute.includes('return ["main"];'), "analyze route must default to main role space");

const mainAi = read("apps/api/src/ai/recommendMainDishesAI.ts");
assert(mainAi.includes("Der aktive Rollenraum ist ausschliesslich starter und salad."), "Main AI starter/salad role rule missing");
assert(mainAi.includes("Der aktive Rollenraum ist ausschliesslich main."), "Main AI main role rule missing");
assert(mainAi.includes("keine_rollenfremde_auffuellung"), "Main AI must forbid role-foreign fill-up");
assert(mainAi.includes("verifyRecommendationSafetyAI"), "Safety verifier must remain active");

const mapper = read("apps/api/src/recommendation/twoStepRecommendationMappers.ts");
assert(mapper.includes("AI-Vorspeisen-/Salatempfehlung"), "mapper starter/salad category missing");
assert(mapper.includes('dishRoles: ["starter", "salad"]'), "mapper starter/salad roles missing");
assert(mapper.includes('dishRoles: ["main"]'), "mapper main role missing");

const activeMobileFiles = [
  "apps/mobile/src/screens/pick/PickScreen.tsx",
  "apps/mobile/src/hooks/useAnalyzeMenu.ts",
  "apps/mobile/src/api/pickformeApi.ts",
  "apps/mobile/src/components/pick/SituationSelector.tsx",
  "apps/mobile/src/components/pick/RecommendationCard.tsx",
  "apps/mobile/src/content/mobileContent.de-DE.json",
  "apps/mobile/src/content/mobileContent.en-US.json"
];
const oldValues = ["leicht", "richtig_hunger", "neues_probieren", "Auf Nummer sicher", "Play it safe", "Etwas Neues", "Single dishes"];

for (const file of activeMobileFiles) {
  const text = read(file);
  for (const oldValue of oldValues) {
    assert(!text.includes(oldValue), `${file}: old active option remains: ${oldValue}`);
  }
}

console.log("recommendation-mode regression passed");
