import type { Situation, UserProfile } from "./profile";

export type AnalyzeMenuRequest = {
  sourceKind: "text";
  menuText: string;
  situation: Situation;
  profile: UserProfile;
  userLocale?: string;
};
