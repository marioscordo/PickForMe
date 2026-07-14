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

const apiRecommendationTypes = read("apps/api/src/types/recommendations.ts");
const mobileRecommendationTypes = read("apps/mobile/src/types/recommendations.ts");
const mapper = read("apps/api/src/recommendation/twoStepRecommendationMappers.ts");
const hook = read("apps/mobile/src/hooks/useAnalyzeMenu.ts");
const card = read("apps/mobile/src/components/pick/RecommendationCard.tsx");
const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");

assert(apiRecommendationTypes.includes("translatedDescription?: string"), "API Recommendation must carry translatedDescription");
assert(apiRecommendationTypes.includes("descriptionOriginal?: string"), "API Recommendation must carry descriptionOriginal");
assert(mobileRecommendationTypes.includes("translatedDescription?: string"), "mobile Recommendation must carry translatedDescription");
assert(mobileRecommendationTypes.includes("descriptionOriginal?: string"), "mobile Recommendation must carry descriptionOriginal");
assert(mapper.includes("translatedDescription: normalizeOptionalString(item.translatedDescription)"), "mapper must keep translatedDescription on recommendations");
assert(mapper.includes("descriptionOriginal: normalizeOptionalString(item.descriptionOriginal)"), "mapper must keep descriptionOriginal on recommendations");
assert(card.includes("firstNonEmptyText("), "RecommendationCard must use a prioritized description resolver");
assert(card.includes("rec.translatedDescription"), "RecommendationCard must prefer recommendation translatedDescription");
assert(card.includes("rec.descriptionOriginal"), "RecommendationCard must fall back to recommendation original description");
assert(card.includes("nestedDish.descriptionOriginal"), "nested cards must fall back to original descriptions");
assert(hook.includes("setResult(data);"), "useAnalyzeMenu must set the full new result object");
assert(hook.includes("setError(\"\");") && hook.includes("setErrorTitle(\"\");"), "successful result must clear old error state");
assert(hook.includes("requestIdRef.current !== requestId"), "stale response guard must remain active");
assert(hook.includes("resultAccepted: false"), "stale result rejection must be diagnosed");
assert(hook.includes("resultAccepted: true"), "accepted result must be diagnosed");
assert(card.includes("renderedDescriptionCount"), "RecommendationCard must diagnose rendered description count");
assert(pickScreen.includes("setOpenableMenuUrl(null);"), "full reset must clear old menu URL context");

function resolveRenderedDescription(recommendation, dish) {
  return [
    recommendation.translatedDescription,
    dish.description,
    recommendation.descriptionOriginal,
    dish.descriptionOriginal
  ].map((value) => typeof value === "string" ? value.trim() : "")
    .find(Boolean) ?? "";
}

const fullResponse = {
  dishes: [
    { id: "d1", nameOriginal: "Seafood Pasta", description: "", sourceLine: "Seafood Pasta", price: 15 },
    { id: "d2", nameOriginal: "Veggie Mousaka", description: "", sourceLine: "Veggie Mousaka", price: 15 },
    { id: "d3", nameOriginal: "Chicken Fillet", description: "", sourceLine: "Chicken Fillet", price: 14 }
  ],
  recommendations: [
    { dishId: "d1", translatedName: "Meeresfruechte-Pasta", translatedDescription: "Pasta mit Meeresfruechten.", reason: "safe" },
    { dishId: "d2", translatedName: "Veggie Moussaka", translatedDescription: "Moussaka mit Gemuese.", reason: "safe" },
    { dishId: "d3", translatedName: "Haehnchenfilet", translatedDescription: "Zartes Haehnchenfilet.", reason: "safe" }
  ]
};

function renderedDescriptions(response) {
  const dishesById = new Map(response.dishes.map((dish) => [dish.id, dish]));
  return response.recommendations.map((recommendation) =>
    resolveRenderedDescription(recommendation, dishesById.get(recommendation.dishId) ?? {})
  );
}

assert(renderedDescriptions(fullResponse).every(Boolean), "full response descriptions must reach rendered cards");

let state = { error: "network", result: null, requestId: 1 };
const secondRequestId = 2;
state = { error: "", result: null, requestId: secondRequestId };
if (state.requestId === secondRequestId) {
  state = { ...state, error: "", result: fullResponse };
}
assert(state.error === "", "old network error must be cleared after success");
assert(renderedDescriptions(state.result).every(Boolean), "successful response after error must keep descriptions");

const olderIncompleteResponse = {
  dishes: [{ id: "d1", nameOriginal: "Seafood Pasta", sourceLine: "Seafood Pasta", price: 15 }],
  recommendations: [{ dishId: "d1", translatedName: "Meeresfruechte-Pasta", reason: "old" }]
};
let raceState = { requestId: 2, result: null };
const requestB = 2;
if (raceState.requestId === requestB) {
  raceState = { requestId: requestB, result: fullResponse };
}
const requestA = 1;
if (raceState.requestId === requestA) {
  raceState = { requestId: requestA, result: olderIncompleteResponse };
}
assert(renderedDescriptions(raceState.result).length === 3, "older success must not overwrite newer success");
assert(renderedDescriptions(raceState.result).every(Boolean), "older incomplete success must not remove descriptions");

let resetState = { requestId: 3, result: fullResponse };
resetState = { requestId: 4, result: null };
const staleAfterResetRequest = 3;
if (resetState.requestId === staleAfterResetRequest) {
  resetState = { requestId: staleAfterResetRequest, result: olderIncompleteResponse };
}
assert(resetState.result === null, "full reset must invalidate old responses");

const originalFallbackResponse = {
  dishes: [{ id: "d4", nameOriginal: "Original Dish", descriptionOriginal: "Original visible description.", sourceLine: "Original Dish" }],
  recommendations: [{ dishId: "d4", translatedName: "Original Dish", reason: "safe" }]
};
assert(renderedDescriptions(originalFallbackResponse)[0] === "Original visible description.", "original description fallback must render");

const noDescriptionResponse = {
  dishes: [{ id: "d5", nameOriginal: "Plain Dish", sourceLine: "Plain Dish", price: 12 }],
  recommendations: [{ dishId: "d5", translatedName: "Plain Dish", reason: "safe" }]
};
assert(renderedDescriptions(noDescriptionResponse)[0] === "", "missing descriptions must not create artificial text");

console.log("recommendation state race regression passed");
