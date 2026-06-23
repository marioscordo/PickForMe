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
      if (looksLikeCategory(line)) {
        currentCategory = line;
      }
      continue;
    }

    const namePart = line.slice(0, priceInfo.index).trim();

    if (namePart.length < 3) {
      continue;
    }

    const price = Number(priceInfo.raw.replace(",", "."));

    if (Number.isNaN(price)) {
      continue;
    }

    const { nameOriginal, descriptionOriginal } = splitNameAndDescription(namePart);

    dishes.push({
      id: `dish_${String(dishes.length + 1).padStart(3, "0")}`,
      nameOriginal,
      descriptionOriginal,
      price,
      category: currentCategory,
      sourceLine: line
    });
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