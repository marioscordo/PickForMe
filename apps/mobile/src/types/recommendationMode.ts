export type RequestedDishRole = "starter" | "salad" | "main";

export type RecommendationModeId = "starters_and_salads" | "main_course";

export type RecommendationModeOption = {
  value: RecommendationModeId;
  label: string;
};

export const DEFAULT_RECOMMENDATION_MODE: RecommendationModeId = "main_course";

export function requestedDishRolesForMode(mode: RecommendationModeId): RequestedDishRole[] {
  return mode === "starters_and_salads" ? ["starter", "salad"] : ["main"];
}
