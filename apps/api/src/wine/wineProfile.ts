export type WinePreference = {
  preferredTypes?: string[];
  taste?: string[];
  structure?: string[];
  favoriteGrapes?: string[];
  excludedStyles?: string[];
};

export type WineRecommendationProfile = {
  outputLocale?: string;
  winePreference?: WinePreference;
};

export function sanitizeWineProfileForRecommendation(profile: unknown): WineRecommendationProfile {
  const input = isRecord(profile) ? profile : {};

  return {
    outputLocale: stringField(input.outputLocale),
    winePreference: {
      preferredTypes: uniqueValues(stringArray(getWinePreferenceField(input, "preferredTypes"))),
      taste: uniqueValues(stringArray(getWinePreferenceField(input, "taste"))),
      structure: uniqueValues(stringArray(getWinePreferenceField(input, "structure"))),
      favoriteGrapes: uniqueValues(stringArray(getWinePreferenceField(input, "favoriteGrapes"))),
      excludedStyles: uniqueValues(stringArray(getWinePreferenceField(input, "excludedStyles")))
    }
  };
}

function getWinePreferenceField(profile: Record<string, unknown>, field: keyof WinePreference) {
  const winePreference = profile.winePreference;

  return isRecord(winePreference) ? winePreference[field] : undefined;
}

function stringArray(values: unknown) {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeWineProfileInputValue(item) === normalizeWineProfileInputValue(value))
      ? result
      : [...result, value.trim()];
  }, []);
}

function normalizeWineProfileInputValue(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
