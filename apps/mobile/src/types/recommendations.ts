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
  priceOriginal?: string;
  priceCurrency?: string;
  priceDisplay?: string;
  priceApproxDisplay?: string;
  priceExchangeRateDate?: string;
  translatedName: string;
  translatedDescription?: string;
  descriptionOriginal?: string;
  starter?: StarterPairing;
};

export type AnalyzeData = {
  mode: "ai" | "ai_pdf" | "fallback";
  menuLanguage?: "de" | "en" | "it" | "es" | "fr" | "ru" | "unknown";
  dishes: Dish[];
  starterCandidateDishes?: Dish[];
  recommendations: Recommendation[];
  conciergeHero?: string;
  analysisStatus?: "analysis_not_safe";
  analysisWarning?: string;
  recommendationResultType?: "uncertain_review";
  restaurantDescription?: string;
  restaurantDescriptionSource?: "official_website";
  restaurantDescriptionUrl?: string;
  recommendationMode?: "single_dishes" | "whole_menu" | "sharing_menu";
  menuType?: string;
};

export type WineRecommendation = {
  recommendationType?: "wine_style";
  title: string;
  wineStyle: string;
  reason: string;
  servingHint?: string | null;
  confidence: "high" | "medium" | "low";
};

export type ConcreteWineRecommendation = {
  recommendationType: "concrete_wine";
  title: string;
  primaryWine: {
    nameOriginal: string;
    displayName: string;
    grapeOrStyle?: string | null;
    region?: string | null;
    vintage?: string | null;
    glassPriceRaw: string;
    priceRaw?: string | null;
    prices?: Array<{
      servingUnit: "glass" | "bottle" | "unknown";
      priceRaw: string;
    }>;
    servingUnit?: "glass" | "bottle" | "unknown";
    sourceEvidence: string;
  };
  reason: string;
  servingHint?: string | null;
  confidence: "high" | "medium";
};

export type WineRecommendationData = {
  recommendation: WineRecommendation | ConcreteWineRecommendation | null;
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


