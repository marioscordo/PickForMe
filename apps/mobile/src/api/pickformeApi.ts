import { apiPost } from "./apiClient";
import { DEFAULT_OUTPUT_LOCALE } from "../config/outputLocales";
import type { UserProfile } from "../types/profile";
import type { AnalyzeData, RestaurantIntroData, StarterPairingsData } from "../types/recommendations";

type Situation = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

type AnalyzeMenuMobileArgs = {
  menuText: string;
  situation: Situation;
  profile: UserProfile;
  signal?: AbortSignal;
};

type ExtractMenuTextFromPhotoArgs = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
  signal?: AbortSignal;
};

type RequestStarterPairingsMobileArgs = AnalyzeMenuMobileArgs & {
  result: AnalyzeData;
  targetDishId: string;
};

type RequestRestaurantIntroMobileArgs = {
  menuText: string;
  profile: UserProfile;
  signal?: AbortSignal;
};

type AnalyzeMenuApiBody = {
  sourceKind: "text";
  menuText: string;
  situation: Situation;
  profile: UserProfile;
};

type ExtractMenuTextFromPhotoBody = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
};

type LogAllergyWarningConfirmationBody = {
  confirmationVersion: string;
  confirmationTimestamp: string;
};

export type ProfilePreferenceClassificationResult = {
  allowed: boolean;
  classification:
    | "food_item"
    | "ingredient"
    | "dish"
    | "food_category"
    | "property"
    | "preparation"
    | "nutrition_goal"
    | "price_or_portion"
    | "ubiquitous_basic"
    | "ambiguous"
    | "unsafe";
  normalizedValue?: string;
  reasonCode?: string;
};

type ClassifyProfilePreferenceBody = {
  value: string;
};

export type RestaurantDiscoveryApiCandidate = {
  id: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  websiteUrl?: string;
  menuUrl?: string;
};

type DiscoverRestaurantsBody = {
  restaurantName: string;
  city: string;
  country?: string;
};

type DiscoverRestaurantMenuBody = {
  candidate: RestaurantDiscoveryApiCandidate;
};

export type RestaurantMenuDiscoveryApiResult = {
  websiteUrl: string;
  menuUrl?: string;
};

export function analyzeMenu(args: AnalyzeMenuMobileArgs) {
  const body: AnalyzeMenuApiBody = {
    sourceKind: "text",
    menuText: args.menuText,
    situation: args.situation,
    profile: {
      ...args.profile,
      outputLocale: args.profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE
    }
  };

  return apiPost<AnalyzeData, AnalyzeMenuApiBody>("/api/analyze-menu", body, {
    signal: args.signal
  });
}

export function extractMenuTextFromPhoto(args: ExtractMenuTextFromPhotoArgs) {
  const body: ExtractMenuTextFromPhotoBody = {
    imageBase64: args.imageBase64,
    mimeType: args.mimeType
  };

  return apiPost<{ menuText: string }, ExtractMenuTextFromPhotoBody>("/api/menu-photo-text", body, {
    signal: args.signal
  });
}

export function requestStarterPairings(args: RequestStarterPairingsMobileArgs) {
  const body = {
    sourceKind: "text" as const,
    menuText: args.menuText,
    situation: args.situation,
    profile: {
      ...args.profile,
      outputLocale: args.profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE
    },
    dishes: args.result.dishes,
    starterCandidateDishes: args.result.starterCandidateDishes,
    recommendations: args.result.recommendations,
    targetDishId: args.targetDishId
  };

  return apiPost<StarterPairingsData, typeof body>(
    "/api/starter-pairings",
    body,
    {
      signal: args.signal
    }
  );
}

export function requestRestaurantIntro(args: RequestRestaurantIntroMobileArgs) {
  const body = {
    menuText: args.menuText,
    userLocale: args.profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE
  };

  return apiPost<RestaurantIntroData, typeof body>(
    "/api/restaurant-intro",
    body,
    {
      signal: args.signal
    }
  );
}

export function classifyProfilePreference(value: string, signal?: AbortSignal) {
  return apiPost<ProfilePreferenceClassificationResult, ClassifyProfilePreferenceBody>(
    "/api/profile-preference-classification",
    { value },
    {
      signal
    }
  );
}

export function discoverRestaurants(body: DiscoverRestaurantsBody) {
  return apiPost<{ candidates: RestaurantDiscoveryApiCandidate[] }, DiscoverRestaurantsBody>(
    "/api/restaurant-discovery",
    body
  );
}

export function discoverRestaurantMenu(candidate: RestaurantDiscoveryApiCandidate) {
  return apiPost<RestaurantMenuDiscoveryApiResult, DiscoverRestaurantMenuBody>(
    "/api/restaurant-menu-discovery",
    { candidate }
  );
}

export function deleteAccount() {
  return apiPost<{ deleted: boolean }, Record<string, never>>("/api/account/delete", {});
}

export function logAllergyWarningConfirmation(body: LogAllergyWarningConfirmationBody) {
  return apiPost<{ logged: boolean }, LogAllergyWarningConfirmationBody>(
    "/api/safety/allergy-warning-confirmation",
    body
  );
}

