import type { Dish, DishRoleTag } from "../types/menu";

type CategoryRoleRule = {
  terms: string[];
  dishRoles: DishRoleTag[];
  primaryRole: DishRoleTag;
  confidence: number;
  isStarterCandidate?: boolean;
  isSafeRecommendationCandidate?: boolean;
};

type CategoryRoleMetadata = Pick<
  Dish,
  | "dishRoles"
  | "primaryRole"
  | "roleConfidence"
  | "roleEvidence"
  | "sourceCategoryOriginal"
  | "sourceCategoryNormalized"
  | "isStarterCandidate"
  | "isSafeRecommendationCandidate"
>;

const CLEAR_CATEGORY_RULES: CategoryRoleRule[] = [
  {
    terms: [
      "vorspeise",
      "vorspeisen",
      "starter",
      "starters",
      "appetizer",
      "appetizers",
      "antipasti",
      "entrees",
      "entrantes",
      "aperitivos",
      "entradas",
      "voorgerechten"
    ],
    dishRoles: ["starter"],
    primaryRole: "starter",
    confidence: 0.95,
    isStarterCandidate: true
  },
  {
    terms: [
      "suppe",
      "suppen",
      "soup",
      "soups",
      "zuppa",
      "zuppe",
      "soupe",
      "soupes",
      "sopa",
      "sopas",
      "soep",
      "soepen"
    ],
    dishRoles: ["soup", "starter"],
    primaryRole: "soup",
    confidence: 0.95,
    isStarterCandidate: true
  },
  {
    terms: [
      "hauptgericht",
      "hauptgerichte",
      "mains",
      "main course",
      "main courses",
      "plats",
      "plats principaux",
      "platos principales",
      "pratos principais",
      "hoofdgerechten",
      "secondi",
      "fisch",
      "fischgerichte",
      "fish",
      "fish dishes",
      "fleischgerichte",
      "meat",
      "meat dishes",
      "pesce",
      "carne"
    ],
    dishRoles: ["main"],
    primaryRole: "main",
    confidence: 0.95,
    isSafeRecommendationCandidate: true
  },
  {
    terms: ["primi"],
    dishRoles: ["main"],
    primaryRole: "main",
    confidence: 0.75,
    isSafeRecommendationCandidate: true
  },
  {
    terms: [
      "dessert",
      "desserts",
      "nachspeise",
      "nachspeisen",
      "dolce",
      "dolci",
      "postre",
      "postres",
      "sobremesa",
      "sobremesas"
    ],
    dishRoles: ["dessert"],
    primaryRole: "dessert",
    confidence: 0.95
  },
  {
    terms: [
      "getranke",
      "getraenke",
      "drink",
      "drinks",
      "beverage",
      "beverages",
      "bevande",
      "boissons",
      "bebidas",
      "dranken"
    ],
    dishRoles: ["drink"],
    primaryRole: "drink",
    confidence: 0.95
  },
  {
    terms: [
      "fruhstuck",
      "fruehstueck",
      "breakfast",
      "colazione",
      "petit dejeuner",
      "desayuno",
      "pequeno almoco",
      "ontbijt"
    ],
    dishRoles: ["breakfast"],
    primaryRole: "breakfast",
    confidence: 0.95
  },
  {
    terms: ["brunch"],
    dishRoles: ["brunch"],
    primaryRole: "brunch",
    confidence: 0.95
  }
];

const CAUTIOUS_CATEGORY_RULES: CategoryRoleRule[] = [
  {
    terms: [
      "salat",
      "salate",
      "salad",
      "salads",
      "insalata",
      "insalate",
      "ensalada",
      "ensaladas",
      "salade",
      "salades"
    ],
    dishRoles: ["salad"],
    primaryRole: "salad",
    confidence: 0.6
  },
  {
    terms: [
      "kinder",
      "kindergerichte",
      "kinderkarte",
      "kids",
      "children"
    ],
    dishRoles: ["kids"],
    primaryRole: "kids",
    confidence: 0.6
  },
  {
    terms: [
      "menu",
      "menue",
      "menus",
      "menues",
      "set menu",
      "set menus",
      "kombination",
      "kombinationen",
      "combination",
      "combinations"
    ],
    dishRoles: ["menuSet"],
    primaryRole: "menuSet",
    confidence: 0.6
  }
];

const BLOCKED_CATEGORY_TERMS = [
  "tageskarte",
  "wochenkarte",
  "saisonkarte",
  "empfehlungen des hauses",
  "klassiker",
  "aus der region",
  "kleine gerichte",
  "snack",
  "snacks",
  "bowl",
  "bowls"
];

const MIXED_CATEGORY_BLOCKERS = [
  "salat",
  "salate",
  "salad",
  "salads",
  "insalata",
  "insalate",
  "bowl",
  "bowls"
];

export function normalizeMenuCategory(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferDishRoleTagsFromCategory(category: string | undefined): DishRoleTag[] {
  const rule = findCategoryRoleRule(category);

  return rule ? [...rule.dishRoles] : [];
}

export function inferPrimaryRoleFromRoleTags(tags: readonly DishRoleTag[]): DishRoleTag | undefined {
  return tags[0];
}

export function buildCategoryRoleMetadata(category: string | undefined): CategoryRoleMetadata | undefined {
  const original = category?.trim();

  if (!original) {
    return undefined;
  }

  const normalized = normalizeMenuCategory(original);
  const rule = findCategoryRoleRuleFromNormalized(normalized);

  if (!rule) {
    return undefined;
  }

  return {
    dishRoles: [...rule.dishRoles],
    primaryRole: rule.primaryRole,
    roleConfidence: rule.confidence,
    roleEvidence: `category: ${original}`,
    sourceCategoryOriginal: original,
    sourceCategoryNormalized: normalized,
    ...(rule.isStarterCandidate === undefined ? {} : { isStarterCandidate: rule.isStarterCandidate }),
    ...(rule.isSafeRecommendationCandidate === undefined
      ? {}
      : { isSafeRecommendationCandidate: rule.isSafeRecommendationCandidate })
  };
}

export function applyCategoryRoleMetadataToDish(dish: Dish, category = dish.sourceCategory ?? dish.category): Dish {
  const metadata = buildCategoryRoleMetadata(category);

  return metadata ? { ...dish, ...metadata } : dish;
}

function findCategoryRoleRule(category: string | undefined): CategoryRoleRule | undefined {
  return findCategoryRoleRuleFromNormalized(normalizeMenuCategory(category));
}

function findCategoryRoleRuleFromNormalized(normalized: string): CategoryRoleRule | undefined {
  if (!normalized || matchesAnyTerm(normalized, BLOCKED_CATEGORY_TERMS)) {
    return undefined;
  }

  const cautiousRule = findMatchingRule(CAUTIOUS_CATEGORY_RULES, normalized);

  if (cautiousRule) {
    return cautiousRule;
  }

  if (matchesAnyTerm(normalized, MIXED_CATEGORY_BLOCKERS)) {
    return undefined;
  }

  return findMatchingRule(CLEAR_CATEGORY_RULES, normalized);
}

function findMatchingRule(rules: CategoryRoleRule[], normalized: string): CategoryRoleRule | undefined {
  return rules.find((rule) => rule.terms.some((term) => matchesTerm(normalized, term)));
}

function matchesAnyTerm(normalized: string, terms: string[]): boolean {
  return terms.some((term) => matchesTerm(normalized, term));
}

function matchesTerm(normalized: string, term: string): boolean {
  const normalizedTerm = normalizeMenuCategory(term);

  return normalized === normalizedTerm ||
    normalized.startsWith(`${normalizedTerm} `) ||
    normalized.endsWith(` ${normalizedTerm}`) ||
    normalized.includes(` ${normalizedTerm} `);
}
