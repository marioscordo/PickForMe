export type Situation = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

export type AppetiteMood = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

export type RecommendationFeedback = {
  dishNameOriginal: string;
  translatedName?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  accepted: boolean;
  createdAt: string;
};

export type UserProfile = {
  displayName: string;
  primaryLikes: string[];
  outputLocale: string;
  appetiteMood?: AppetiteMood;

  customExclusions?: string[];
  allergens?: string[];

  hiddenPreferences?: string[];
  hiddenExclusions?: string[];
  hiddenAllergens?: string[];
  deletedPreferences?: string[];
  deletedExclusions?: string[];
};


