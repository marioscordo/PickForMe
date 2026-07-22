export type WineCandidate = {
  id: string;
  nameOriginal: string;
  grapeOrStyle?: string;
  region?: string;
  vintage?: string;
  glassPriceRaw?: string;
  priceRaw?: string;
  prices?: WineCandidatePrice[];
  servingUnit: "glass" | "bottle" | "unknown";
  sourceEvidence: string;
};

export type WineCandidatePrice = {
  servingUnit: "glass" | "bottle" | "unknown";
  priceRaw: string;
};

const MAX_WINE_CANDIDATES = 60;
const PRICE_PATTERN = /(?:(?:\u20ac|eur|euro)\s*\d{1,4}(?:[.,]\d+)?|\d{1,4}(?:[.,]\d+)?\s*(?:\u20ac|eur|euro))/gi;
const VINTAGE_PATTERN = /\b(?:19|20)\d{2}\b/;
const GLASS_PATTERN = /\b(?:glas|glass|0[,.](?:1|15|2)\s*l|0[,.]\d+\s*cl|1\/8|1\/4)\b/i;
const BOTTLE_PATTERN = /\b(?:flasche|bottle|0[,.]7[05]\s*l|75\s*cl|750\s*ml)\b/i;

const WINE_TERMS = [
  "wein",
  "wine",
  "vino",
  "weisswein",
  "weiss",
  "weißwein",
  "rotwein",
  "rose",
  "rosé",
  "schaumwein",
  "sparkling",
  "prosecco",
  "sekt",
  "champagner",
  "champagne",
  "riesling",
  "grauburgunder",
  "weissburgunder",
  "weißburgunder",
  "chardonnay",
  "sauvignon",
  "pinot",
  "spätburgunder",
  "spaetburgunder",
  "merlot",
  "chianti",
  "primitivo",
  "tempranillo",
  "rioja",
  "barolo",
  "lambrusco",
  "grüner veltliner",
  "gruener veltliner"
];

const WINE_SECTION_TERMS = [
  "weinkarte",
  "wein",
  "weine",
  "wine",
  "wines",
  "vino",
  "vini",
  "getraenke",
  "getränke",
  "drinks",
  "beverages"
];

const GENERIC_SECTION_ONLY_TERMS = new Set([
  "wein",
  "weine",
  "wine",
  "wines",
  "vino",
  "vini",
  "rotwein",
  "weisswein",
  "weißwein",
  "rose",
  "rosé",
  "schaumwein",
  "sparkling wine"
]);

export function extractWineCandidates(menuText: string): WineCandidate[] {
  const lines = menuText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates: WineCandidate[] = [];
  let currentSection = "";

  for (const line of lines) {
    if (looksLikeSection(line)) {
      currentSection = line;
      continue;
    }

    const candidate = parseWineCandidateLine(line, currentSection, candidates.length);

    if (candidate) {
      candidates.push(candidate);
    }

    if (candidates.length >= MAX_WINE_CANDIDATES) {
      break;
    }
  }

  return dedupeWineCandidates(candidates);
}

function parseWineCandidateLine(line: string, currentSection: string, index: number): WineCandidate | null {
  const combined = `${currentSection} ${line}`;

  if (!hasAnyWineTerm(combined)) {
    return null;
  }

  const prices = extractWinePrices(line);
  const glassPriceRaw = prices.find((price) => price.servingUnit === "glass")?.priceRaw;
  const priceRaw = formatWinePrices(prices);
  const servingUnit = getServingUnit(line);
  const hasConcreteSignal = Boolean(priceRaw) || servingUnit !== "unknown" || VINTAGE_PATTERN.test(line);

  if (!hasConcreteSignal) {
    return null;
  }

  const nameOriginal = cleanWineName(removeWinePrices(line, prices));

  if (!nameOriginal || isGenericWineSectionName(nameOriginal)) {
    return null;
  }

  return {
    id: `wine_${String(index + 1).padStart(3, "0")}`,
    nameOriginal,
    grapeOrStyle: inferGrapeOrStyle(nameOriginal),
    vintage: line.match(VINTAGE_PATTERN)?.[0],
    ...(glassPriceRaw ? { glassPriceRaw } : {}),
    priceRaw,
    ...(prices.length ? { prices } : {}),
    servingUnit,
    sourceEvidence: line
  };
}

function looksLikeSection(line: string) {
  if (line.length > 42 || PRICE_PATTERN.test(line)) {
    PRICE_PATTERN.lastIndex = 0;
    return false;
  }

  PRICE_PATTERN.lastIndex = 0;
  return hasAnyTerm(normalizeText(line), WINE_SECTION_TERMS);
}

function extractLastPrice(line: string) {
  const matches = [...line.matchAll(PRICE_PATTERN)];
  const last = matches[matches.length - 1];

  return last?.[0]?.trim();
}

function removeWinePrices(line: string, prices: WineCandidatePrice[]) {
  return prices.reduce((current, price) => current.replace(price.priceRaw, ""), line);
}

function extractWinePrices(line: string): WineCandidatePrice[] {
  const matches = [...line.matchAll(PRICE_PATTERN)];

  if (matches.length === 0) {
    return [];
  }

  const glassPrice = matches
    .map((match) => ({
      amount: parseWinePriceAmount(match[0]),
      priceRaw: match[0].trim()
    }))
    .filter((price): price is { amount: number; priceRaw: string } => Number.isFinite(price.amount))
    .sort((left, right) => left.amount - right.amount)[0];

  return glassPrice ? [{ priceRaw: glassPrice.priceRaw, servingUnit: "glass" }] : [];
}

function parseWinePriceAmount(value: string) {
  const match = value.match(/\d{1,4}(?:[.,]\d+)?/);

  if (!match) {
    return Number.NaN;
  }

  return Number(match[0].replace(",", "."));
}

function formatWinePrices(prices: WineCandidatePrice[]) {
  if (prices.length === 0) {
    return undefined;
  }

  return prices
    .map((price) => {
      if (price.servingUnit === "glass") return `Glas ${price.priceRaw}`;
      if (price.servingUnit === "bottle") return `Flasche ${price.priceRaw}`;
      return price.priceRaw;
    })
    .join(" · ");
}

function getServingUnit(line: string): WineCandidate["servingUnit"] {
  if (GLASS_PATTERN.test(line)) {
    return "glass";
  }

  if (BOTTLE_PATTERN.test(line)) {
    return "bottle";
  }

  return "unknown";
}

function cleanWineName(value: string) {
  return value
    .replace(/\b(?:glas|glass|flasche|bottle)\b/gi, "")
    .replace(/\b\d+(?:[,.]\d+)?\s*(?:l|cl|ml)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[-–|]\s*$/g, "")
    .trim();
}

function isGenericWineSectionName(value: string) {
  return GENERIC_SECTION_ONLY_TERMS.has(normalizeText(value));
}

function inferGrapeOrStyle(value: string) {
  const normalized = normalizeText(value);
  const term = WINE_TERMS.find((candidate) => hasTerm(normalized, candidate));

  return term && !GENERIC_SECTION_ONLY_TERMS.has(normalizeText(term)) ? term : undefined;
}

function hasAnyWineTerm(value: string) {
  return hasAnyTerm(normalizeText(value), WINE_TERMS);
}

function hasAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => hasTerm(value, term));
}

function hasTerm(value: string, term: string) {
  const escaped = normalizeText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(value);
}

function dedupeWineCandidates(candidates: WineCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = normalizeText(`${candidate.nameOriginal} ${candidate.priceRaw ?? ""}`);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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
