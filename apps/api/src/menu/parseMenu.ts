import { applyCategoryRoleMetadataToDish } from "./categoryRoleRules";
import { isMenuMarkerLine } from "./menuMarkers";
import type { Dish } from "../types/menu";

const PRICE_PATTERN = /\d{1,3}(?:[.,]\d{2})/g;

const SKIP_PATTERNS = [
  /öffnungszeiten|oeffnungszeiten/i,
  /alle preise/i,
  /inkl\.?\s*mwst/i,
  /zusatzstoffe/i,
  /allergene/i
];

export function parseMenu(menuText: string): Dish[] {
  const lines = menuText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dishes: Dish[] = [];
  let currentCategory: string | undefined;

  for (const line of lines) {
    if (shouldSkipLine(line)) {
      continue;
    }

    const priceInfo = extractLastPrice(line);

    if (!priceInfo) {
      if (!isMenuMarkerLine(line) && looksLikeCategory(line)) {
        currentCategory = line;
      }
      continue;
    }

    const rawNamePart = line.slice(0, priceInfo.index).trim();
    const categoryAsName = Boolean(currentCategory && isQuantityOnlyName(rawNamePart));
    const namePart = categoryAsName && currentCategory ? currentCategory : rawNamePart;

    if (namePart.length < 3) {
      continue;
    }

    const price = Number(priceInfo.raw.replace(",", "."));

    if (Number.isNaN(price)) {
      continue;
    }

    const { nameOriginal, descriptionOriginal } = splitNameAndDescription(namePart);
    const isDrink = isDrinkEntry({ namePart, rawNamePart, category: currentCategory, sourceLine: line });

    const dish: Dish = {
      id: `dish_${String(dishes.length + 1).padStart(3, "0")}`,
      nameOriginal,
      descriptionOriginal: categoryAsName ? rawNamePart : descriptionOriginal,
      price,
      category: categoryAsName ? undefined : currentCategory,
      itemType: isDrink ? "drink" : "dish",
      dishRole: isDrink ? "drink" : undefined,
      sourceLine: line
    };

    dishes.push(applyCategoryRoleMetadataToDish(dish));

    if (categoryAsName) {
      currentCategory = undefined;
    }
  }

  return dishes;
}

function extractLastPrice(line: string): { raw: string; index: number } | null {
  const matches = [...line.matchAll(PRICE_PATTERN)];

  if (matches.length === 0) {
    return null;
  }

  const last = matches[matches.length - 1];

  if (!last || typeof last.index !== "number") {
    return null;
  }

  const raw = last[0];

  if (!raw) {
    return null;
  }

  const tail = line.slice(last.index + raw.length).trim();

  if (!isAcceptablePriceTail(tail)) {
    return null;
  }

  return {
    raw,
    index: last.index
  };
}

function isAcceptablePriceTail(tail: string) {
  if (!tail) {
    return true;
  }

  const normalized = tail.trim().toLowerCase();

  return normalized === "\u20ac" || normalized === "eur" || normalized === "euro";
}

function shouldSkipLine(line: string) {
  return SKIP_PATTERNS.some((pattern) => pattern.test(line));
}

function isQuantityOnlyName(value: string) {
  return /^\d+(?:[,.]\d+)?\s*(?:l|liter|ml|cl)\b\.?$/i.test(value.trim());
}

function isDrinkEntry({
  namePart,
  rawNamePart,
  category,
  sourceLine
}: {
  namePart: string;
  rawNamePart: string;
  category: string | undefined;
  sourceLine: string;
}) {
  const normalizedName = normalizeText(namePart);
  const normalizedRawName = normalizeText(rawNamePart);
  const normalizedCategory = normalizeText(category ?? "");
  const normalizedLine = normalizeText(sourceLine);
  const combined = `${normalizedName} ${normalizedRawName} ${normalizedCategory} ${normalizedLine}`;

  if (hasAnyTerm(combined, FOOD_COUNTER_TERMS)) {
    return false;
  }

  if (isQuantityOnlyName(rawNamePart) && hasAnyTerm(normalizedCategory, DRINK_TERMS)) {
    return true;
  }

  if (hasAnyTerm(normalizedName, DRINK_TERMS) && hasVolumeMarker(sourceLine)) {
    return true;
  }

  return hasAnyTerm(normalizedCategory, DRINK_SECTION_TERMS) && hasAnyTerm(combined, DRINK_TERMS);
}

const DRINK_TERMS = [
  "coca cola",
  "cola",
  "fanta",
  "sprite",
  "mezzo mix",
  "softdrink",
  "limonade",
  "lemonade",
  "soda",
  "wasser",
  "mineralwasser",
  "acqua",
  "espresso",
  "cappuccino",
  "kaffee",
  "coffee",
  "tee",
  "tea",
  "saft",
  "juice",
  "bier",
  "beer",
  "pils",
  "weizen",
  "wein",
  "wine",
  "vino",
  "prosecco",
  "sekt",
  "champagner",
  "champagne",
  "cocktail",
  "aperol",
  "spritz",
  "vodka",
  "bacardi",
  "gin",
  "rum",
  "whisky"
];

const DRINK_SECTION_TERMS = [
  ...DRINK_TERMS,
  "getraenke",
  "getranke",
  "drinks",
  "beverages",
  "softdrinks",
  "alkoholfrei",
  "longdrinks",
  "weinkarte",
  "cocktails"
];

const FOOD_COUNTER_TERMS = [
  "sauce",
  "sosse",
  "risotto",
  "pasta",
  "spaghetti",
  "steak",
  "filet",
  "fish",
  "fisch",
  "chicken",
  "haehnchen",
  "beef",
  "rind",
  "pork",
  "schwein",
  "salat",
  "salad",
  "pizza",
  "burger"
];

function hasAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => hasTerm(value, term));
}

function hasTerm(value: string, term: string) {
  const escaped = normalizeText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(value);
}

function hasVolumeMarker(value: string) {
  return /\b\d+(?:[,.]\d+)?\s*(?:l|liter|ml|cl)\b/i.test(value);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCategory(line: string) {
  if (line.length > 32) {
    return false;
  }

  if (PRICE_PATTERN.test(line)) {
    PRICE_PATTERN.lastIndex = 0;
    return false;
  }

  PRICE_PATTERN.lastIndex = 0;
  return /^[\p{L}\s&-]+$/u.test(line);
}

function splitNameAndDescription(value: string) {
  const lower = value.toLowerCase();
  const separators = [" - ", " – ", " mit ", " an "];

  for (const separator of separators) {
    const index = lower.indexOf(separator);

    if (index > 2) {
      return {
        nameOriginal: value.slice(0, index).trim(),
        descriptionOriginal: value.slice(index).trim()
      };
    }
  }

  return {
    nameOriginal: value
  };
}
