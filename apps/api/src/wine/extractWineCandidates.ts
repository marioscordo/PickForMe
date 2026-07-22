export type WineCandidate = {
  id: string;
  nameOriginal: string;
  grapeOrStyle?: string;
  region?: string;
  vintage?: string;
  priceRaw?: string;
  servingUnit: "glass" | "bottle" | "unknown";
  sourceEvidence: string;
};

const MAX_WINE_CANDIDATES = 60;
const PRICE_PATTERN = /(?:(?:\u20ac|eur|euro)\s*)?\d{1,4}(?:[.,]\d{2})(?:\s*(?:\u20ac|eur|euro))?/gi;
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

  const priceRaw = extractLastPrice(line);
  const servingUnit = getServingUnit(line);
  const hasConcreteSignal = Boolean(priceRaw) || servingUnit !== "unknown" || VINTAGE_PATTERN.test(line);

  if (!hasConcreteSignal) {
    return null;
  }

  const nameOriginal = cleanWineName(priceRaw ? line.replace(priceRaw, "") : line);

  if (!nameOriginal || isGenericWineSectionName(nameOriginal)) {
    return null;
  }

  return {
    id: `wine_${String(index + 1).padStart(3, "0")}`,
    nameOriginal,
    grapeOrStyle: inferGrapeOrStyle(nameOriginal),
    vintage: line.match(VINTAGE_PATTERN)?.[0],
    priceRaw,
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
