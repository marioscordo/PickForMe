export type DishSourceFormat = "html" | "text" | "pdf" | "ocr" | "ai";

export type DishItemType = "dish" | "drink" | "unknown";

export type DishRole = "starter" | "main" | "side" | "dessert" | "drink" | "unknown";

export type MealType = "salad" | "pasta" | "pizza" | "meat" | "fish" | "vegetarian" | "dessert" | "unknown";

export type SubstanceLevel = "light" | "medium" | "substantial" | "unknown";

export type Dish = {
  id: string;
  nameOriginal: string;
  descriptionOriginal?: string;
  price?: number;
  category?: string;
  itemType?: DishItemType;
  sourceFormat?: DishSourceFormat;
  sourceCategory?: string;
  dishRole?: DishRole;
  mealType?: MealType;
  substanceLevel?: SubstanceLevel;
  isMainCourseCandidate?: boolean;
  isLightDishCandidate?: boolean;
  classificationConfidence?: number;
  sourceLine: string;
};
