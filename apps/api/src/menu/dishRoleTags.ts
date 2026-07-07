import type { Dish, DishRole, DishRoleTag } from "../types/menu";

type DishRoleSource = Pick<Dish, "dishRole" | "dishRoles" | "primaryRole">;

const LEGACY_DISH_ROLE_TAGS: Record<DishRole, DishRoleTag[]> = {
  starter: ["starter"],
  main: ["main"],
  side: ["side"],
  dessert: ["dessert"],
  drink: ["drink"],
  unknown: ["unknown"]
};

export function legacyDishRoleToRoleTags(dishRole: DishRole | undefined): DishRoleTag[] {
  return [...(dishRole ? LEGACY_DISH_ROLE_TAGS[dishRole] : LEGACY_DISH_ROLE_TAGS.unknown)];
}

export function getDishRoleTags(dish: DishRoleSource): DishRoleTag[] {
  if (dish.dishRoles && dish.dishRoles.length > 0) {
    return [...dish.dishRoles];
  }

  return legacyDishRoleToRoleTags(dish.dishRole);
}

export function getPrimaryDishRoleTag(dish: DishRoleSource): DishRoleTag {
  if (dish.primaryRole) {
    return dish.primaryRole;
  }

  return getDishRoleTags(dish)[0] ?? "unknown";
}
