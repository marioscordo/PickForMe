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

export type OrderLabels = {
  main: string;
  starter: string;
  title: string;
  wine: string;
};

export type MenuLanguage = "de" | "en" | "it" | "es" | "fr" | "id" | "ru" | "unknown";

export type AnalyzeData = {
  mode: "ai" | "ai_pdf" | "fallback";
  menuLanguage?: MenuLanguage;
  orderLabels?: OrderLabels;
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
  // Token-Optimierung Juli 2026: nur bei Text-/HTML-Speisekarten gesetzt
  // (nie bei PDF/Bild). Kann bei einer zweiten Analyse desselben Menues
  // (z.B. "Vorspeisen suchen") anstelle der urspruenglichen menuText-URL
  // gesendet werden, um den Re-Fetch/Re-Parse zu vermeiden.
  reusableMenuText?: string;
};

export type WineRecommendation = {
  recommendationType?: "wine_style";
  title: string;
  wineStyle: string;
  reason: string;
  servingHint?: string | null;
  // Produktidee Juli 2026: fertig aussprechbarer Bestellsatz fuer
  // Kellner/Sommelier, unabhaengig von jeder konkreten Weinkarte.
  sommelierPhrase?: string | null;
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

export type RestaurantDiscoveryCandidate = {
  id: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  websiteUrl?: string;
};

export type RestaurantDiscoveryData = {
  candidates: RestaurantDiscoveryCandidate[];
};

export type RestaurantMenuSourceExternalCandidate = {
  url: string;
  providerDomain: string;
};

export type RestaurantMenuSourceData = {
  websiteUrl: string;
  menuUrl?: string;
  menuUrls?: string[];
  externalMenuCandidate?: RestaurantMenuSourceExternalCandidate;
  confidence?: "high" | "medium" | "none";
  reason?: string;
};


