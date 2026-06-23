import { apiPost } from "./apiClient";
import type { UserProfile } from "../types/profile";
import type { AnalyzeData } from "../types/recommendations";

type Situation = "leicht" | "regional" | "teilen" | "überraschen";

type AnalyzeMenuMobileArgs = {
  menuText: string;
  situation: Situation;
  profile: UserProfile;
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

  return apiPost<AnalyzeData, AnalyzeMenuApiBody>("/api/analyze-menu", body);
}
