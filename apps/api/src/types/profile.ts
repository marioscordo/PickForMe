export type Situation = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

export type AppetiteMood = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

export type UserProfile = {
  displayName: string;
  primaryLikes: string[];
  outputLocale: string;
  appetiteMood?: AppetiteMood;

  customExclusions?: string[];
  allergens?: string[];
  winePreference?: WinePreference;
};

export type WinePreference = {
  preferredTypes?: string[];
  taste?: string[];
  structure?: string[];
  favoriteGrapes?: string[];
  excludedStyles?: string[];
};


