import { profileFeatures } from "../config/profileFeatures";
import {
  classifyProfileInputDeterministically
} from "../ai/classifyProfilePreferenceAI";
import type { UserProfile } from "../types/profile";

export function sanitizeProfileForRecommendation(profile: UserProfile): UserProfile {
  const primaryLikes = filterControlledProfileValues(profile.primaryLikes);
  const customExclusions = filterControlledProfileValues(profile.customExclusions ?? []);
  const allergens = uniqueValues(filterControlledProfileValues(profile.allergens ?? []));

  return {
    displayName: profile.displayName,
    outputLocale: profile.outputLocale,
    primaryLikes,
    customExclusions,
    allergens: profileFeatures.allergenModuleEnabled ? allergens : [],
    winePreference: {
      preferredTypes: uniqueValues(stringArray(profile.winePreference?.preferredTypes)),
      taste: uniqueValues(stringArray(profile.winePreference?.taste)),
      structure: uniqueValues(stringArray(profile.winePreference?.structure)),
      favoriteGrapes: uniqueValues(stringArray(profile.winePreference?.favoriteGrapes)),
      excludedStyles: uniqueValues(stringArray(profile.winePreference?.excludedStyles))
    }
  };
}

function stringArray(values: unknown) {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function filterControlledProfileValues(values: string[]) {
  return values.filter((value) => !classifyProfileInputDeterministically(value));
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
