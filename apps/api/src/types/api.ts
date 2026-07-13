import type { Situation, UserProfile } from "./profile";

export type RequestedDishRole = "starter" | "salad" | "main";

export type AnalyzeMenuRequest = {
  sourceKind: "text";
  menuText: string;
  menuUrls?: string[];
  situation?: Situation;
  requestedDishRoles?: RequestedDishRole[];
  diagnosticRunId?: string;
  profile: UserProfile;
  userLocale?: string;
};
