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
assert(
  de.help.pickInput.points.includes("Wenn Du Dich für ein Gericht entschieden hast, kannst Du Dir dazu optional noch eine Vorspeise oder einen Salat empfehlen lassen."),
  "de-DE: embedded starter/salad help text missing"
);
assert(
  en.help.pickInput.points.includes("Once you have chosen a dish, you can optionally ask for a starter or salad as an additional course."),
  "en-US: embedded starter/salad help text missing"
);
assert(!("menuReady" in de.pick), "de-DE: menu ready box text must be removed");
assert(!("menuReady" in en.pick), "en-US: menu ready box text must be removed");
assert(!("menuReadyAtRestaurant" in de.pick), "de-DE: dynamic restaurant ready text must be removed");
assert(!("menuReadyAtRestaurant" in en.pick), "en-US: dynamic restaurant ready text must be removed");
assert(!("linkAccepted" in de.pick), "de-DE: old link accepted text must be removed");
assert(!("linkAccepted" in en.pick), "en-US: old link accepted text must be removed");

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
assert(!pickScreen.includes("linkAccepted"), "PickScreen must not render the old temporary link accepted hint");
assert(pickScreen.includes("<AnalysisLoadingBox"), "PickScreen must use the shared analysis loading box");
assert(pickScreen.includes("steps={loadingSteps}"), "PickScreen must pass localized loading steps to the shared loading box");
assert(!pickScreen.includes("content.pick.menuReady"), "PickScreen must not render a persistent menu ready box");
assert(!pickScreen.includes("buildMenuReadyText"), "PickScreen must not keep menu ready restaurant formatting logic");
const reviewButtonIndex = pickScreen.indexOf("content.pick.reviewPreferences");
const mainButtonIndex = pickScreen.indexOf("content.pick.mainButtonLoading");
const loadingBoxIndex = pickScreen.indexOf("<AnalysisLoadingBox");
assert(reviewButtonIndex > 0 && mainButtonIndex > reviewButtonIndex, "PickScreen must place review preferences above the main analyze button");
assert(loadingBoxIndex > mainButtonIndex, "PickScreen must place the loading box below the main analyze button");

const analysisLoadingBox = read("apps/mobile/src/components/pick/AnalysisLoadingBox.tsx");
assert(analysisLoadingBox.includes("ANALYSIS_LOADING_STEP_INTERVAL_MS = 10000"), "shared loading box steps must stay visible for 10 seconds");
assert(analysisLoadingBox.includes("(current + 1) % steps.length"), "shared loading box steps must cycle without empty text");
assert(analysisLoadingBox.includes("return () => clearInterval(timer);"), "shared loading box must clean up its timer");
assert(analysisLoadingBox.includes("loadingTrackWidth"), "shared loading box animation must use measured width");
assert(analysisLoadingBox.includes("Math.max(loadingTrackWidth - s(56), 0)"), "shared loading box animation must span the available track width");
assert(!analysisLoadingBox.includes("magnifier"), "shared loading box must not introduce a magnifier animation");
assert(!analysisLoadingBox.includes("menuLine"), "shared loading box must not introduce animated menu lines");

const useAnalyzeMenu = read("apps/mobile/src/hooks/useAnalyzeMenu.ts");
assert(useAnalyzeMenu.includes("requestedDishRoles: RequestedDishRole[]"), "useAnalyzeMenu must accept requestedDishRoles");
assert(!useAnalyzeMenu.includes("appetiteMood: situation"), "useAnalyzeMenu must not write mood into profile payload");
assert(!useAnalyzeMenu.includes("preferredDishRole"), "top-level analyze hook must not send embedded role preference");

const apiClient = read("apps/mobile/src/api/pickformeApi.ts");
assert(apiClient.includes("requestedDishRoles: args.requestedDishRoles"), "mobile API payload must include requestedDishRoles");
assert(apiClient.includes("preferredDishRole?: PreferredDishRole"), "mobile API payload must allow optional preferredDishRole");
assert(!apiClient.includes("requestStarterPairings"), "mobile API client must not expose starter pairing call");
assert(!apiClient.includes('"/api/starter-pairings"'), "mobile API client must not call starter-pairings");

const recommendationCard = read("apps/mobile/src/components/pick/RecommendationCard.tsx");
assert(!recommendationCard.includes("starterSearch"), "RecommendationCard must not render starter search states");
assert(!recommendationCard.includes("requestStarterPairings"), "RecommendationCard must not call starter pairings");
assert(!recommendationCard.includes("targetDishId"), "RecommendationCard must not send targetDishId");
assert(recommendationCard.includes("showStartersAndSaladsAction"), "RecommendationCard must gate nested action by main-mode prop");
assert(recommendationCard.includes('requestedDishRoles: ["starter", "salad"]'), "RecommendationCard nested action must reuse starter/salad analyze roles");
assert(recommendationCard.includes('preferredDishRole: "starter"'), "RecommendationCard nested action must prefer starters");
assert(recommendationCard.includes("nestedLoadingDishIdsRef"), "RecommendationCard must guard fast double taps");
assert(recommendationCard.includes("activeNestedDishIdRef"), "RecommendationCard must synchronously guard nested requests across different dishes");
assert(recommendationCard.includes("mountedRef"), "RecommendationCard must guard nested request state updates after unmount");
assert(recommendationCard.includes("activeNestedDishId === rec.dishId"), "RecommendationCard must bind nested active state to stable dishId");
assert(recommendationCard.includes('isNestedActiveDish && nestedState.status === "loading"'), "RecommendationCard must show nested loading only for the active loading dish");
assert(recommendationCard.includes("activeNestedDishIdRef.current !== dishId"), "RecommendationCard must ignore stale nested responses after active context reset");
assert(recommendationCard.includes("<AnalysisLoadingBox"), "RecommendationCard must render the shared loading box for nested analysis");
assert(recommendationCard.includes("steps={content.pick.loadingSteps}"), "RecommendationCard nested loading box must use localized loading steps");
assert(recommendationCard.includes("title={content.pick.loadingTitle}"), "RecommendationCard nested loading box must use the localized loading title");
assert(recommendationCard.includes("activeDishId && activeDishId !== dishId"), "RecommendationCard must reject nested requests for inactive dishes");
assert(recommendationCard.includes('currentStatus === "loaded"'), "RecommendationCard must not restart loaded nested analysis accidentally");
assert(recommendationCard.includes("accessibilityState={{ disabled: Boolean(disabled) }}"), "RecommendationCard action disabled state must be accessible");

const apiTypes = read("apps/api/src/types/api.ts");
assert(apiTypes.includes('export type RequestedDishRole = "starter" | "salad" | "main";'), "API requested role type missing");
assert(apiTypes.includes("requestedDishRoles?: RequestedDishRole[]"), "AnalyzeMenuRequest must include requestedDishRoles");
assert(apiTypes.includes('PreferredDishRole = Extract<RequestedDishRole, "starter" | "salad">'), "API preferred role type missing");

const analyzeRoute = read("apps/api/app/api/analyze-menu/route.ts");
assert(analyzeRoute.includes("normalizeRequestedDishRoles(body.requestedDishRoles)"), "analyze route must normalize requested roles");
assert(analyzeRoute.includes("normalizePreferredDishRole(body.preferredDishRole)"), "analyze route must normalize preferred role");
assert(analyzeRoute.includes('return ["starter", "salad"];'), "analyze route must normalize starter/salad role space");
assert(analyzeRoute.includes('return ["main"];'), "analyze route must default to main role space");
assert(analyzeRoute.includes('mainAiInputMode: "extracted_text"'), "PDF fast path must mark extracted-text input mode");
assert(analyzeRoute.includes('mainAiInputMode: "pdf_file_fallback"'), "PDF fallback must keep file-input mode");
assert(analyzeRoute.includes("isExistingPdfTextQualityUsableForAnalysis"), "PDF fast path must reuse existing quality metrics");

const mainAi = read("apps/api/src/ai/recommendMainDishesAI.ts");
assert(mainAi.includes("Der aktive Rollenraum ist ausschliesslich starter und salad."), "Main AI starter/salad role rule missing");
assert(mainAi.includes("Der aktive Rollenraum ist ausschliesslich main."), "Main AI main role rule missing");
assert(mainAi.includes("keine_rollenfremde_auffuellung"), "Main AI must forbid role-foreign fill-up");
assert(mainAi.includes("Optionale Rollenpraeferenz"), "Main AI optional starter preference rule missing");
assert(mainAi.includes("Salate bleiben erlaubt"), "Main AI must keep salads allowed for embedded starter preference");
assert(mainAi.includes("fuelle verbleibende Plaetze mit sicheren Salaten auf"), "Main AI must fill with safe salads when starters are insufficient");
assert(mainAi.includes("verifyRecommendationSafetyAI"), "Safety verifier must remain active");
assert(mainAi.includes('phase: "api.main_ai_request"'), "Main AI request timing diagnostic missing");
assert(mainAi.includes("contentDiagnostics"), "Main AI request diagnostic must include input mode metadata");

const twoStepUtils = read("apps/api/src/ai/twoStepRecommendationAIUtils.ts");
assert(twoStepUtils.includes('source.mainAiInputMode !== "extracted_text"'), "extracted-text PDF mode must skip PDF file input");
assert(twoStepUtils.includes("pdfFileInputIncluded"), "source content diagnostic must report PDF file input");

const mapper = read("apps/api/src/recommendation/twoStepRecommendationMappers.ts");
assert(mapper.includes("AI-Vorspeisen-/Salatempfehlung"), "mapper starter/salad category missing");
assert(mapper.includes('dishRoles: ["starter", "salad"]'), "mapper starter/salad roles missing");
assert(mapper.includes('dishRoles: ["main"]'), "mapper main role missing");

const activeMobileFiles = [
  "apps/mobile/src/screens/pick/PickScreen.tsx",
  "apps/mobile/src/hooks/useAnalyzeMenu.ts",
  "apps/mobile/src/api/pickformeApi.ts",
  "apps/mobile/src/components/pick/AnalysisLoadingBox.tsx",
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
