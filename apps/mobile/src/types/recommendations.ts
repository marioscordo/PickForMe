import type { Dish } from "./menu";

export type Recommendation = {
  dishId: string;
  reason: string;
};

export type AnalyzeData = {
  mode: "ai" | "fallback";
  dishes: Dish[];
  recommendations: Recommendation[];
};
