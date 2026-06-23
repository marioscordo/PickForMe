export type Situation = "leicht" | "regional" | "teilen" | "überraschen";

export type UserProfile = {
  displayName: string;
  primaryLikes: string[];
  secondaryLikes: string[];
  dislikes: string[];
  intolerances: string[];
  dietStyle: "normal" | "vegetarisch" | "vegan" | "flexitarisch";
};
