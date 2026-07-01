import type {
  DishRole,
  MealType,
  SubstanceLevel
} from "../../types/menu";

export type MenuSourceFormat = "html";

export type MenuExtractionConfidence = "high" | "medium" | "low";

export type MenuExtractionItem = {
  title: string;
  description?: string;
  price?: string;
  category?: string;
  sourceCategory?: string;
  sourceFormat: MenuSourceFormat;
  dishRole?: DishRole;
  mealType?: MealType;
  substanceLevel?: SubstanceLevel;
  isMainCourseCandidate?: boolean;
  isLightDishCandidate?: boolean;
  classificationConfidence?: number;
  confidence: number;
  sourceText: string;
};

export type MenuExtractionResult = {
  sourceFormat: MenuSourceFormat;
  items: MenuExtractionItem[];
  confidence: MenuExtractionConfidence;
  warnings: string[];
  fragments: string[];
};
