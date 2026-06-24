export type Situation = "leicht" | "regional" | "teilen" | "überraschen";

export type AppetiteMood = "richtig_hunger" | "leicht" | "neues_probieren" | "sicher";

export type UserProfile = {
  displayName: string;
  primaryLikes: string[];
  secondaryLikes: string[];
  dislikes: string[];
  intolerances: string[];
  dietStyle: "normal" | "vegetarisch" | "vegan" | "flexitarisch";
  appetiteMood?: AppetiteMood;
  exceptions?: string[];

  customPreferences?: string[];
  customExclusions?: string[];
  customIntolerances?: string[];
  customExceptions?: string[];

  hiddenPreferences?: string[];
  hiddenExclusions?: string[];
  hiddenIntolerances?: string[];
  hiddenExceptions?: string[];
};
