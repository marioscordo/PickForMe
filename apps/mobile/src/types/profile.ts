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
  secondaryLikes: string[];
  dislikes: string[];
  intolerances: string[];
  dietStyle: "normal" | "vegetarisch" | "vegan" | "flexitarisch";
  outputLocale: string;
  appetiteMood?: AppetiteMood;

  customPreferences?: string[];
  customExclusions?: string[];
  customIntolerances?: string[];

  hiddenPreferences?: string[];
  hiddenExclusions?: string[];
  hiddenIntolerances?: string[];
};


