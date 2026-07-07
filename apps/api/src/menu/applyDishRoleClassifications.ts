import type { Dish, DishRoleTag } from "../types/menu";

export type DishRoleClassification = {
  dishId: string;
  dishRoles: DishRoleTag[];
  primaryRole: DishRoleTag;
  roleConfidence: number;
  roleEvidence: string;
};

const DISH_ROLE_TAGS = new Set<DishRoleTag>([
  "starter",
  "soup",
  "salad",
  "main",
  "side",
  "dessert",
  "drink",
  "breakfast",
  "brunch",
  "kids",
  "menuSet",
  "unknown"
]);

const CAUTIOUS_ROLE_CONTEXT_TERMS = [
  "salat",
  "salate",
  "salad",
  "salads",
  "insalata",
  "insalate",
  "bowl",
  "bowls",
  "kinder",
  "kids",
  "menu",
  "menue",
  "kombination",
  "combination"
];

export function getDishesNeedingRoleClassification(dishes: Dish[]): Dish[] {
  return dishes.filter(needsDishRoleClassification);
}

export function applyDishRoleClassifications(
  dishes: Dish[],
  classifications: DishRoleClassification[]
): Dish[] {
  if (classifications.length === 0) {
    return dishes;
  }

  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));
  const classificationByDishId = new Map<string, DishRoleClassification>();

  for (const classification of classifications) {
    if (classificationByDishId.has(classification.dishId)) {
      continue;
    }

    const dish = dishesById.get(classification.dishId);

    if (!dish || !needsDishRoleClassification(dish) || !isValidClassificationForDish(dish, classification)) {
      continue;
    }

    classificationByDishId.set(classification.dishId, classification);
  }

  if (classificationByDishId.size === 0) {
    return dishes;
  }

  return dishes.map((dish) => {
    const classification = classificationByDishId.get(dish.id);

    if (!classification) {
      return dish;
    }

    const hasExistingRoles = hasMeaningfulDishRoles(dish);
    const hasExistingPrimaryRole = hasMeaningfulPrimaryRole(dish);
    const nextDishRoles = hasExistingRoles ? dish.dishRoles : classification.dishRoles;
    const nextPrimaryRole = hasExistingPrimaryRole ? dish.primaryRole : classification.primaryRole;

    return {
      ...dish,
      dishRoles: nextDishRoles,
      primaryRole: nextPrimaryRole,
      roleConfidence: classification.roleConfidence,
      roleEvidence: classification.roleEvidence
    };
  });
}

function needsDishRoleClassification(dish: Dish): boolean {
  return !hasMeaningfulDishRoles(dish) || !hasMeaningfulPrimaryRole(dish);
}

function hasMeaningfulDishRoles(dish: Dish): boolean {
  const roles = dish.dishRoles ?? [];

  return roles.length > 0 && !(roles.length === 1 && roles[0] === "unknown");
}

function hasMeaningfulPrimaryRole(dish: Dish): boolean {
  return Boolean(dish.primaryRole && dish.primaryRole !== "unknown");
}

function isValidClassificationForDish(dish: Dish, classification: DishRoleClassification): boolean {
  if (!Number.isFinite(classification.roleConfidence) || classification.roleConfidence < 0 || classification.roleConfidence > 1) {
    return false;
  }

  if (!isGroundedEvidence(dish, classification.roleEvidence)) {
    return false;
  }

  const roles = normalizeDishRoleTags(classification.dishRoles);

  if (roles.length === 0 || roles.length !== classification.dishRoles.length) {
    return false;
  }

  if (!DISH_ROLE_TAGS.has(classification.primaryRole) || !roles.includes(classification.primaryRole)) {
    return false;
  }

  if (roles.includes("unknown") && (roles.length > 1 || classification.primaryRole !== "unknown")) {
    return false;
  }

  if (hasMeaningfulDishRoles(dish) && !rolesEqual(dish.dishRoles ?? [], roles)) {
    return false;
  }

  if (hasMeaningfulPrimaryRole(dish) && dish.primaryRole !== classification.primaryRole) {
    return false;
  }

  if (looksLikeCautiousRoleContext(dish) && (classification.primaryRole === "starter" || classification.primaryRole === "main")) {
    return false;
  }

  return true;
}

function normalizeDishRoleTags(values: DishRoleTag[]): DishRoleTag[] {
  const roles: DishRoleTag[] = [];

  for (const value of values) {
    if (!DISH_ROLE_TAGS.has(value) || roles.includes(value)) {
      continue;
    }

    roles.push(value);
  }

  return roles;
}

function rolesEqual(left: DishRoleTag[], right: DishRoleTag[]) {
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

function isGroundedEvidence(dish: Dish, evidence: string): boolean {
  const normalizedEvidence = normalizeForMatching(evidence);

  if (!normalizedEvidence) {
    return false;
  }

  return [
    dish.category,
    dish.sourceCategory,
    dish.sourceCategoryOriginal,
    dish.nameOriginal,
    dish.descriptionOriginal,
    dish.sourceLine
  ].some((value) => {
    const normalizedValue = normalizeForMatching(value ?? "");

    return normalizedValue.includes(normalizedEvidence);
  });
}

function looksLikeCautiousRoleContext(dish: Dish): boolean {
  const context = normalizeForMatching([
    dish.category,
    dish.sourceCategory,
    dish.sourceCategoryOriginal,
    dish.nameOriginal,
    dish.descriptionOriginal,
    dish.sourceLine
  ].filter(Boolean).join(" "));

  return CAUTIOUS_ROLE_CONTEXT_TERMS.some((term) => hasTerm(context, term));
}

function hasTerm(value: string, term: string): boolean {
  const escaped = normalizeForMatching(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(value);
}

function normalizeForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
