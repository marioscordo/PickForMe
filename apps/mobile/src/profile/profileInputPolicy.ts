export const GLOBAL_ALLERGEN_VALUES = [
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

const MAX_PROFILE_INPUT_LENGTH = 60;
const MAX_PROFILE_INPUT_WORDS = 6;

const GLOBAL_ALLERGEN_ALIASES = [
  "Gluten",
  "Ei",
  "Soja",
  "Nuesse",
  "Nusse",
  "Nüsse",
  "Fructose"
];

const DETERMINISTIC_BLOCK_VALUES = new Set([
  "scharf",
  "spicy",
  "mild",
  "guenstig",
  "gunstig",
  "affordable",
  "cheap",
  "teuer",
  "expensive",
  "grosse portion",
  "grosser teller",
  "kleine portion",
  "large portion",
  "large portions",
  "small portion",
  "proteinreich",
  "high protein",
  "high-protein",
  "leicht",
  "light",
  "gesund",
  "healthy",
  "deftig",
  "cremig",
  "creamy",
  "knusprig",
  "crunchy",
  "gegrillt",
  "grilled",
  "hausgemacht",
  "homemade",
  "saettigend",
  "sattigend",
  "filling",
  "kalorienarm",
  "low calorie",
  "low-calorie",
  "low carb",
  "low-carb",
  "schnell",
  "fast",
  "klassisch",
  "classic",
  "modern",
  "salz",
  "salt",
  "pfeffer",
  "pepper",
  "oel",
  "ol",
  "oil",
  "wasser",
  "water",
  "zucker",
  "sugar",
  "gewuerze",
  "gewurze",
  "spices",
  "kraeuter",
  "krauter",
  "herbs",
  "wuerzung",
  "wurzung",
  "seasoning",
  "sosse",
  "sosse allgemein",
  "sauce",
  "marinade",
  "marinade allgemein"
].map(normalizeProfileInputValue));

const GLOBAL_ALLERGEN_LOOKUP = new Set([
  ...GLOBAL_ALLERGEN_VALUES,
  ...GLOBAL_ALLERGEN_ALIASES
].map(normalizeProfileInputValue));

export function isGlobalAllergenValue(value: string) {
  return GLOBAL_ALLERGEN_LOOKUP.has(normalizeProfileInputValue(value));
}

export function isDeterministicallyBlockedProfileInput(value: string) {
  const trimmed = value.trim();

  return trimmed.length === 0 ||
    trimmed.length > MAX_PROFILE_INPUT_LENGTH ||
    trimmed.split(/\s+/).length > MAX_PROFILE_INPUT_WORDS ||
    DETERMINISTIC_BLOCK_VALUES.has(normalizeProfileInputValue(trimmed));
}

export function filterControlledProfileValues(values: string[]) {
  return values.filter((value) => !isDeterministicallyBlockedProfileInput(value));
}

export function splitGlobalAllergens(values: string[]) {
  return values.reduce<{ allergens: string[]; rest: string[] }>(
    (result, value) => {
      if (isGlobalAllergenValue(value)) {
        result.allergens.push(value);
      } else {
        result.rest.push(value);
      }

      return result;
    },
    { allergens: [], rest: [] }
  );
}

export function normalizeProfileInputValue(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
