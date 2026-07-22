export type Situation = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

export type AppetiteMood = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

export type WinePreference = {
  preferredTypes?: string[];
  taste?: string[];
  structure?: string[];
  favoriteGrapes?: string[];
  excludedStyles?: string[];
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
  winePreference?: WinePreference;
};


