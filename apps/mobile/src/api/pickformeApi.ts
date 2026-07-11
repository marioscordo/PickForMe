import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiPost } from "./apiClient";
import { DEFAULT_OUTPUT_LOCALE, resolveOutputLocale } from "../config/outputLocales";
import { resolveGuiLanguageFromDevice } from "../content/guiLanguage";
import { profileFeatures } from "../config/profileFeatures";
import {
  filterControlledProfileValues,
  splitGlobalAllergens
} from "../profile/profileInputPolicy";
import type { UserProfile } from "../types/profile";
import type { AnalyzeData, RestaurantIntroData, StarterPairingsData } from "../types/recommendations";

type Situation = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

type AnalyzeMenuMobileArgs = {
  menuText: string;
  menuUrls?: string[];
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
  menuUrls?: string[];
  situation: Situation;
  profile: UserProfile;
  userLocale: string;
};

type ExtractMenuTextFromPhotoBody = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
};

type LogAllergyWarningConfirmationBody = {
  confirmationVersion: string;
  confirmationTimestamp: string;
};

export type TestFeedbackCategory =
  | "menu_discovery"
  | "photo_menu"
  | "recommendation"
  | "profile"
  | "allergens_exclusions"
  | "login"
  | "display"
  | "other";

export type TestFeedbackSeverity = "blocker" | "annoying" | "minor";

export type SubmitTestFeedbackArgs = {
  category: TestFeedbackCategory;
  city?: string;
  contactAllowed: boolean;
  description: string;
  expectedBehavior?: string;
  locale?: string;
  restaurantName?: string;
  screenContext?: string;
  severity?: TestFeedbackSeverity;
  stepsToReproduce?: string;
};

type SubmitTestFeedbackBody = SubmitTestFeedbackArgs & {
  appVersion: string;
  buildNumber: string;
  deviceModel?: string;
  osVersion: string;
  platform: string;
  submittedAt: string;
};

const MOBILE_APP_VERSION = "1.0.0";
const ANDROID_BUILD_NUMBER = "1";

export type ProfilePreferenceClassificationResult = {
  allowed: boolean;
  classification:
    | "food_item"
    | "ingredient"
    | "dish"
    | "food_category"
    | "allergen"
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

type ProfileInputKind = "preference" | "exclusion";

type ClassifyProfilePreferenceBody = {
  inputKind?: ProfileInputKind;
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
  menuUrls?: string[];
  externalMenuCandidate?: ExternalMenuCandidateApiResult;
};

export type ExternalMenuCandidateApiResult = {
  url: string;
  providerDomain: string;
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
  menuUrls?: string[];
  externalMenuCandidate?: ExternalMenuCandidateApiResult;
};

export function analyzeMenu(args: AnalyzeMenuMobileArgs) {
  const body: AnalyzeMenuApiBody = {
    sourceKind: "text",
    menuText: args.menuText,
    ...(args.menuUrls?.length ? { menuUrls: args.menuUrls } : {}),
    situation: args.situation,
    profile: sanitizeProfileForApi(args.profile),
    userLocale: resolveGuiLanguageFromDevice()
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
    profile: sanitizeProfileForApi(args.profile),
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
  const outputLocale = resolveOutputLocale(args.profile.outputLocale);
  const body = {
    menuText: args.menuText,
    outputLocale,
    userLocale: resolveGuiLanguageFromDevice()
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
  return classifyProfileInput(value, "preference", signal);
}

export function classifyProfileInput(value: string, inputKind: ProfileInputKind, signal?: AbortSignal) {
  return apiPost<ProfilePreferenceClassificationResult, ClassifyProfilePreferenceBody>(
    "/api/profile-preference-classification",
    { inputKind, value },
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

export function submitTestFeedback(args: SubmitTestFeedbackArgs) {
  const body: SubmitTestFeedbackBody = {
    ...args,
    appVersion: getNativeAppVersion(),
    buildNumber: getNativeBuildNumber(),
    deviceModel: getDeviceModel(),
    osVersion: String(Platform.Version ?? ""),
    platform: Platform.OS,
    submittedAt: new Date().toISOString()
  };

  return apiPost<{ submitted: boolean }, SubmitTestFeedbackBody>(
    "/api/test-feedback",
    body
  );
}

function getDeviceModel() {
  const constants = Platform.constants as Record<string, unknown> | undefined;
  const model = constants?.Model ?? constants?.model;

  return typeof model === "string" && model.trim().length > 0 ? model.trim() : undefined;
}

function getNativeAppVersion() {
  return Constants.nativeAppVersion?.trim() ||
    Constants.expoConfig?.version?.trim() ||
    MOBILE_APP_VERSION;
}

function getNativeBuildNumber() {
  return Constants.nativeBuildVersion?.trim() ||
    Constants.expoConfig?.ios?.buildNumber?.trim() ||
    (Platform.OS === "ios" ? "" : ANDROID_BUILD_NUMBER);
}

function sanitizeProfileForApi(profile: UserProfile): UserProfile {
  const activeProfile = { ...profile };
  delete activeProfile.hiddenPreferences;
  delete activeProfile.hiddenExclusions;
  delete activeProfile.hiddenIntolerances;
  delete activeProfile.hiddenAllergens;
  const splitIntolerances = splitGlobalAllergens(profile.intolerances);
  const splitCustomIntolerances = splitGlobalAllergens(profile.customIntolerances ?? []);
  const allergens = [
    ...(profile.allergens ?? []),
    ...splitIntolerances.allergens,
    ...splitCustomIntolerances.allergens
  ];
  const controlledAllergens = profileFeatures.allergenModuleEnabled
    ? uniqueValues(filterControlledProfileValues(allergens))
    : [];
  const controlledIntolerances = filterControlledProfileValues([
    ...splitIntolerances.rest,
    ...splitCustomIntolerances.rest
  ]);

  return {
    ...activeProfile,
    outputLocale: profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE,
    primaryLikes: filterControlledProfileValues(profile.primaryLikes),
    customPreferences: filterControlledProfileValues(profile.customPreferences ?? []),
    dislikes: filterControlledProfileValues(profile.dislikes),
    customExclusions: filterControlledProfileValues(profile.customExclusions ?? []),
    allergens: controlledAllergens,
    intolerances: uniqueValues([...controlledAllergens, ...controlledIntolerances]),
    customIntolerances: controlledIntolerances
  };
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => item.trim().toLowerCase() === value.trim().toLowerCase())
      ? result
      : [...result, value];
  }, []);
}

