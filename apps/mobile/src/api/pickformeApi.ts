import { apiPost } from "./apiClient";
import type { Situation, UserProfile } from "../types/profile";
import type { AnalyzeData } from "../types/recommendations";

export function analyzeMenu(args: {
  menuText: string;
  situation: Situation;
  profile: UserProfile;
}) {
  return apiPost<AnalyzeData, typeof args>("/api/analyze-menu", args);
}
