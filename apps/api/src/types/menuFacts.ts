import type { DishRole, MealType, SubstanceLevel } from "./menu";

export type MenuItemFactType = "dish" | "course" | "drink" | "unknown";

export type MenuItemOrderability = "standalone" | "part_of_menu" | "unclear";

export type MenuItemFact = {
  id: string;
  itemType: MenuItemFactType;
  nameOriginal: string;
  translatedName?: string;
  descriptionOriginal?: string;
  priceRaw?: string;
  orderability: MenuItemOrderability;
  parentMenuUnitId?: string;
  dishRole?: DishRole;
  mealType?: MealType;
  substanceLevel?: SubstanceLevel;
  isMainCourseCandidate?: boolean;
  isLightDishCandidate?: boolean;
  classificationConfidence?: number;
  evidence: string;
};

export type MenuUnitFact = {
  id: string;
  itemType: "whole_menu" | "sharing_menu";
  titleOriginal: string;
  translatedName?: string;
  descriptionOriginal?: string;
  priceRaw?: string;
  includedItemIds?: string[];
  orderability: "standalone";
  evidence: string;
};

export type MenuFacts = {
  menuType?: string;
  items: MenuItemFact[];
  menuUnits: MenuUnitFact[];
};
