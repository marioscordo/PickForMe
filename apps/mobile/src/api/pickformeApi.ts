import { apiPost } from "./apiClient";
import type { UserProfile } from "../types/profile";
import type { AnalyzeData } from "../types/recommendations";

type Situation = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

type AnalyzeMenuMobileArgs = {
  menuText: string;
  situation: Situation;
  profile: UserProfile;
  signal?: AbortSignal;
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
    profile: args.profile
  };

  return apiPost<AnalyzeData, AnalyzeMenuApiBody>("/api/analyze-menu", body, {
    signal: args.signal
  });
}

