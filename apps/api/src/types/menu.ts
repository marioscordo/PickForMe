export type DishSourceFormat = "html" | "text" | "pdf" | "ocr" | "ai";

export type DishItemType = "dish" | "drink" | "unknown";

export type DishRole = "starter" | "main" | "side" | "dessert" | "drink" | "unknown";

export type DishRoleTag = "starter" | "soup" | "salad" | "main" | "side" | "dessert" | "drink" | "breakfast" | "brunch" | "kids" | "menuSet" | "unknown";

export type MealType = "salad" | "pasta" | "pizza" | "meat" | "fish" | "vegetarian" | "dessert" | "unknown";

export type SubstanceLevel = "light" | "medium" | "substantial" | "unknown";

export type Dish = {
  id: string;
  nameOriginal: string;
  description?: string;
  descriptionOriginal?: string;
  price?: number;
  category?: string;
  itemType?: DishItemType;
  sourceFormat?: DishSourceFormat;
  sourceCategory?: string;
  dishRole?: DishRole;
  dishRoles?: DishRoleTag[];
  primaryRole?: DishRoleTag;
  roleConfidence?: number;
  roleEvidence?: string;
  sourceCategoryOriginal?: string;
  sourceCategoryNormalized?: string;
  sourceOrder?: number;
  categoryOrder?: number;
  sourceUrl?: string;
  sourcePage?: number;
  isStarterCandidate?: boolean;
  isSafeRecommendationCandidate?: boolean;
  mealType?: MealType;
  substanceLevel?: SubstanceLevel;
  isMainCourseCandidate?: boolean;
  isLightDishCandidate?: boolean;
  classificationConfidence?: number;
  sourceLine: string;
};
