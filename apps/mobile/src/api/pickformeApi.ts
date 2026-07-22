import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiPost } from "./apiClient";
import { DEFAULT_OUTPUT_LOCALE, resolveOutputLocale } from "../config/outputLocales";
import { resolveDeviceLocaleFromDevice, resolveGuiLanguageFromDevice } from "../content/guiLanguage";
import { profileFeatures } from "../config/profileFeatures";
import { filterControlledProfileValues } from "../profile/profileInputPolicy";
import type { UserProfile } from "../types/profile";
import type { PreferredDishRole, RequestedDishRole } from "../types/recommendationMode";
import type { AnalyzeData, RestaurantIntroData, WineRecommendationData } from "../types/recommendations";

type AnalyzeMenuMobileArgs = {
  menuText: string;
  menuUrls?: string[];
  menuImageSource?: MenuImageSource | null;
  requestedDishRoles: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  profile: UserProfile;
  diagnosticRunId?: string;
  onResponseStatus?: (status: number) => void;
  signal?: AbortSignal;
};

export type MenuImageSource = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
};

type ExtractMenuTextFromPhotoArgs = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
  signal?: AbortSignal;
};

type RequestRestaurantIntroMobileArgs = {
  menuText: string;
  profile: UserProfile;
  signal?: AbortSignal;
};

type RequestWineRecommendationMobileArgs = {
  mainDish: WineRecommendationMainDish;
  menuText?: string;
  menuUrls?: string[];
  profile: UserProfile;
  signal?: AbortSignal;
};

type WineProfileForApi = {
  outputLocale: string;
  winePreference: {
    preferredTypes?: string[];
    taste?: string[];
    structure?: string[];
    favoriteGrapes?: string[];
    excludedStyles?: string[];
  };
};

type WineRecommendationMainDish = {
  rank?: number;
  nameOriginal: string;
  translatedName?: string;
  descriptionOriginal?: string | null;
  translatedDescription?: string | null;
  sourceEvidence?: string | null;
  reason?: string;
};

type AnalyzeMenuApiBody = {
  sourceKind: "text" | "image";
  menuText: string;
  menuUrls?: string[];
  imageBase64?: string;
  mimeType?: "image/jpeg" | "image/png";
  requestedDishRoles: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  diagnosticRunId?: string;
  supportsUncertainReviewCandidates?: boolean;
  profile: UserProfile;
  userLocale: string;
  deviceLocale?: string;
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

export function analyzeMenu(args: AnalyzeMenuMobileArgs) {
  const imageSource = args.menuImageSource?.imageBase64?.trim()
    ? args.menuImageSource
    : null;
  const body: AnalyzeMenuApiBody = {
    sourceKind: imageSource ? "image" : "text",
    menuText: args.menuText,
    ...(args.menuUrls?.length ? { menuUrls: args.menuUrls } : {}),
    ...(imageSource ? { imageBase64: imageSource.imageBase64, mimeType: imageSource.mimeType } : {}),
    requestedDishRoles: args.requestedDishRoles,
    ...(args.preferredDishRole ? { preferredDishRole: args.preferredDishRole } : {}),
    ...(args.diagnosticRunId ? { diagnosticRunId: args.diagnosticRunId } : {}),
    supportsUncertainReviewCandidates: true,
    profile: sanitizeProfileForApi(args.profile),
    userLocale: resolveGuiLanguageFromDevice(),
    ...(resolveDeviceLocaleFromDevice() ? { deviceLocale: resolveDeviceLocaleFromDevice() } : {})
  };

  return apiPost<AnalyzeData, AnalyzeMenuApiBody>("/api/analyze-menu", body, {
    onResponseStatus: args.onResponseStatus,
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

export function requestWineRecommendation(args: RequestWineRecommendationMobileArgs) {
  const body = {
    mainDish: args.mainDish,
    profile: sanitizeWineProfileForApi(args.profile),
    userLocale: resolveGuiLanguageFromDevice()
  };

  return apiPost<WineRecommendationData, typeof body>(
    "/api/wine-recommendation",
    body,
    {
      signal: args.signal
    }
  );
}

export function requestWineMenuRecommendation(args: RequestWineRecommendationMobileArgs) {
  const body = {
    mainDish: args.mainDish,
    menuText: args.menuText ?? "",
    ...(args.menuUrls?.length ? { menuUrls: args.menuUrls } : {}),
    profile: sanitizeWineProfileForApi(args.profile),
    userLocale: resolveGuiLanguageFromDevice()
  };

  return apiPost<WineRecommendationData, typeof body>(
    "/api/wine-menu-recommendation",
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
  return sanitizeBaseProfileForApi(profile);
}

function sanitizeBaseProfileForApi(profile: UserProfile): UserProfile {
  const controlledAllergens = profileFeatures.allergenModuleEnabled
    ? uniqueValues(filterControlledProfileValues(profile.allergens ?? []))
    : [];

  return {
    displayName: profile.displayName,
    outputLocale: profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE,
    primaryLikes: uniqueValues(filterControlledProfileValues(profile.primaryLikes)),
    customExclusions: uniqueValues(filterControlledProfileValues(profile.customExclusions ?? [])),
    allergens: controlledAllergens
  };
}

function sanitizeWineProfileForApi(profile: UserProfile): WineProfileForApi {
  return {
    outputLocale: profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE,
    winePreference: {
      preferredTypes: uniqueValues(stringArray(profile.winePreference?.preferredTypes)),
      taste: uniqueValues(stringArray(profile.winePreference?.taste)),
      structure: uniqueValues(stringArray(profile.winePreference?.structure)),
      favoriteGrapes: uniqueValues(stringArray(profile.winePreference?.favoriteGrapes)),
      excludedStyles: uniqueValues(stringArray(profile.winePreference?.excludedStyles))
    }
  };
}

function stringArray(values: unknown) {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeProfileValue(item) === normalizeProfileValue(value))
      ? result
      : [...result, value];
  }, []);
}

function normalizeProfileValue(value: string) {
  return value.trim().normalize("NFC").toLowerCase();
}

