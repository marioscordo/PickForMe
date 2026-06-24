import type { Dish } from "./menu";

export type Recommendation = {
  dishId: string;
  rank?: number;
  reason: string;
  translatedName: string;
};

export type AnalyzeData = {
  mode: "ai" | "ai_pdf" | "fallback";
  dishes: Dish[];
  recommendations: Recommendation[];
};


