import type { Dish } from "./menu";

export type StarterPairing = {
  nameOriginal: string;
  translatedName?: string;
  priceRaw?: string;
  evidence?: string;
};

export type Recommendation = {
  dishId: string;
  rank?: number;
  reason: string;
  facts?: string;
  translatedName: string;
  starter?: StarterPairing;
};

export type AnalyzeData = {
  mode: "ai" | "ai_pdf" | "fallback";
  dishes: Dish[];
  starterCandidateDishes?: Dish[];
  recommendations: Recommendation[];
  conciergeHero?: string;
  analysisStatus?: "analysis_not_safe";
  analysisWarning?: string;
  restaurantDescription?: string;
  restaurantDescriptionSource?: "official_website";
  restaurantDescriptionUrl?: string;
  recommendationMode?: "single_dishes" | "whole_menu" | "sharing_menu";
  menuType?: string;
};

export type StarterPairingsData = {
  recommendations: AnalyzeData["recommendations"];
  starterRetryableError?: boolean;
  starterErrorCode?: "TEMPORARY_AI_ERROR";
};

export type RestaurantIntroData = {
  title: string;
  introText: string;
  sourceKind?: "official_website" | "pdf" | "html" | "text" | "unknown";
  sourceUrl?: string;
  limitedSource?: boolean;
  fallback?: boolean;
};


