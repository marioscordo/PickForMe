import { apiPost } from "./apiClient";
import { DEFAULT_OUTPUT_LOCALE } from "../config/outputLocales";
import type { UserProfile } from "../types/profile";
import type { AnalyzeData } from "../types/recommendations";

type Situation = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

type AnalyzeMenuMobileArgs = {
  menuText: string;
  situation: Situation;
  profile: UserProfile;
  signal?: AbortSignal;
};

type RequestStarterPairingsMobileArgs = AnalyzeMenuMobileArgs & {
  result: AnalyzeData;
  targetDishId: string;
};

type AnalyzeMenuApiBody = {
  sourceKind: "text";
  menuText: string;
  situation: Situation;
  profile: UserProfile;
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
    recommendations: args.result.recommendations,
    targetDishId: args.targetDishId
  };

  return apiPost<{ recommendations: AnalyzeData["recommendations"] }, typeof body>(
    "/api/starter-pairings",
    body,
    {
      signal: args.signal
    }
  );
}

