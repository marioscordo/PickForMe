import type { Situation, UserProfile } from "./profile";

export type AnalyzeMenuRequest = {
  sourceKind: "text";
  menuText: string;
  menuUrls?: string[];
  situation: Situation;
  profile: UserProfile;
  userLocale?: string;
};
