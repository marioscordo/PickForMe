import type { Dish } from "./menu";

export type Recommendation = {
  dishId: string;
  rank?: number;
  reason: string;
  facts?: string;
  translatedName: string;
};

export type AnalyzeData = {
  mode: "ai" | "ai_pdf" | "fallback";
  dishes: Dish[];
  recommendations: Recommendation[];
  conciergeHero?: string;
  recommendationMode?: "single_dishes" | "whole_menu" | "sharing_menu";
  menuType?: string;
};


