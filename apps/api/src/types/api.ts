import type { Situation, UserProfile } from "./profile";

export type RequestedDishRole = "starter" | "salad" | "main";
export type PreferredDishRole = Extract<RequestedDishRole, "starter" | "salad">;

export type AnalyzeMenuRequest = {
  sourceKind: "text" | "image";
  menuText: string;
  menuUrls?: string[];
  imageBase64?: string;
  mimeType?: "image/jpeg" | "image/png";
  situation?: Situation;
  requestedDishRoles?: RequestedDishRole[];
  preferredDishRole?: PreferredDishRole;
  diagnosticRunId?: string;
  supportsUncertainReviewCandidates?: boolean;
  profile: UserProfile;
  userLocale?: string;
  deviceLocale?: string;
};
