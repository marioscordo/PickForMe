import { profileFeatures } from "../config/profileFeatures";
import {
  classifyProfileInputDeterministically
} from "../ai/classifyProfilePreferenceAI";
import type { UserProfile } from "../types/profile";

const GLOBAL_ALLERGEN_VALUES = [
  "glutenhaltiges Getreide",
  "Weizen",
  "Roggen",
  "Gerste",
  "Hafer",
  "Dinkel",
  "Kamut / Khorasan-Weizen",
  "Triticale",
  "Krebstiere",
  "Schalentiere",
  "Weichtiere / Mollusken",
  "Fisch",
  "Eier",
  "Milch",
  "Laktose",
  "Erdnuesse",
  "Schalenfruechte / Baumnuesse",
  "Mandeln",
  "Haselnuesse",
  "Walnuesse",
  "Cashews",
  "Pekannuesse",
  "Paranuesse",
  "Pistazien",
  "Macadamia / Queensland-Nuesse",
  "Pinienkerne",
  "Soja / Sojabohnen",
  "Sesam",
  "Sellerie",
  "Senf",
  "Sulfite / Schwefeldioxid",
  "Lupinen"
];

const GLOBAL_ALLERGEN_ALIASES = [
  "Gluten",
  "Ei",
  "Soja",
  "Nuesse",
  "Nusse",
  "Nüsse",
  "Fructose"
];

const GLOBAL_ALLERGEN_LOOKUP = new Set([
  ...GLOBAL_ALLERGEN_VALUES,
  ...GLOBAL_ALLERGEN_ALIASES
].map(normalizeProfileInputValue));

export function sanitizeProfileForRecommendation(profile: UserProfile): UserProfile {
  const activeProfile = { ...profile };
  delete activeProfile.hiddenPreferences;
  delete activeProfile.hiddenExclusions;
  delete activeProfile.hiddenIntolerances;
  delete activeProfile.hiddenAllergens;
  const primaryLikes = filterControlledProfileValues(profile.primaryLikes);
  const customPreferences = filterControlledProfileValues(profile.customPreferences ?? []);
  const dislikes = filterControlledProfileValues(profile.dislikes);
  const customExclusions = filterControlledProfileValues(profile.customExclusions ?? []);
  const rawAllergens = [
    ...(profile.allergens ?? []),
    ...profile.intolerances.filter(isGlobalAllergenValue),
    ...(profile.customIntolerances ?? []).filter(isGlobalAllergenValue)
  ];
  const rawIntolerances = [
    ...profile.intolerances,
    ...(profile.customIntolerances ?? [])
  ].filter((value) => !isGlobalAllergenValue(value));
  const allergens = uniqueValues(filterControlledProfileValues(rawAllergens));
  const controlledIntolerances = uniqueValues(filterControlledProfileValues(rawIntolerances));

  return {
    ...activeProfile,
    primaryLikes,
    customPreferences,
    dislikes,
    customExclusions,
    allergens: profileFeatures.allergenModuleEnabled ? allergens : [],
    intolerances: profileFeatures.allergenModuleEnabled
      ? uniqueValues([...allergens, ...controlledIntolerances])
      : controlledIntolerances,
    customIntolerances: controlledIntolerances
  };
}

function filterControlledProfileValues(values: string[]) {
  return values.filter((value) => !classifyProfileInputDeterministically(value));
}

function isGlobalAllergenValue(value: string) {
  return GLOBAL_ALLERGEN_LOOKUP.has(normalizeProfileInputValue(value));
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeProfileInputValue(item) === normalizeProfileInputValue(value))
      ? result
      : [...result, value];
  }, []);
}

function normalizeProfileInputValue(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
