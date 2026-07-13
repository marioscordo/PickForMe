import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiPost } from "./apiClient";
import { DEFAULT_OUTPUT_LOCALE, resolveOutputLocale } from "../config/outputLocales";
import { resolveGuiLanguageFromDevice } from "../content/guiLanguage";
import { profileFeatures } from "../config/profileFeatures";
import { filterControlledProfileValues } from "../profile/profileInputPolicy";
import type { UserProfile } from "../types/profile";
import type { RequestedDishRole } from "../types/recommendationMode";
import type { AnalyzeData, RestaurantIntroData } from "../types/recommendations";

type AnalyzeMenuMobileArgs = {
  menuText: string;
  menuUrls?: string[];
  requestedDishRoles: RequestedDishRole[];
  profile: UserProfile;
  diagnosticRunId?: string;
  signal?: AbortSignal;
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

type AnalyzeMenuApiBody = {
  sourceKind: "text";
  menuText: string;
  menuUrls?: string[];
  requestedDishRoles: RequestedDishRole[];
  diagnosticRunId?: string;
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
  const body: AnalyzeMenuApiBody = {
    sourceKind: "text",
    menuText: args.menuText,
    ...(args.menuUrls?.length ? { menuUrls: args.menuUrls } : {}),
    requestedDishRoles: args.requestedDishRoles,
    ...(args.diagnosticRunId ? { diagnosticRunId: args.diagnosticRunId } : {}),
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
  const controlledAllergens = profileFeatures.allergenModuleEnabled
    ? uniqueValues(filterControlledProfileValues(profile.allergens ?? []))
    : [];

  return {
    displayName: profile.displayName,
    outputLocale: profile.outputLocale ?? DEFAULT_OUTPUT_LOCALE,
    primaryLikes: filterControlledProfileValues(profile.primaryLikes),
    customExclusions: filterControlledProfileValues(profile.customExclusions ?? []),
    allergens: controlledAllergens
  };
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => item.trim().toLowerCase() === value.trim().toLowerCase())
      ? result
      : [...result, value];
  }, []);
}

