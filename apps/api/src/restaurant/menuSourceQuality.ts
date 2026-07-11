import { loadMenuTextFromUrl } from "../menu/loadMenuTextFromUrl";
import { parseMenu } from "../menu/parseMenu";

export type MenuSourceQualityMetrics = {
  textLength: number;
  dishCount: number;
  priceCount: number;
  score: number;
};

export type MenuSourceQualityCandidate = {
  url: string;
  label?: string;
  urls?: string[];
  baseScore?: number;
};

export type RankedMenuSourceQualityCandidate = MenuSourceQualityCandidate & {
  metrics: MenuSourceQualityMetrics;
};

const MENU_TEXT_FETCH_TIMEOUT_MS = 6500;

export async function rankMenuSourceCandidatesByQuality(
  candidates: MenuSourceQualityCandidate[]
): Promise<RankedMenuSourceQualityCandidate[]> {
  const ranked = await Promise.all(candidates.map(async (candidate) => {
    const metrics = await getCombinedMenuSourceQualityMetrics(candidate);

    return {
      ...candidate,
      metrics
    };
  }));

  return ranked.sort((left, right) =>
    right.metrics.score - left.metrics.score ||
    right.metrics.textLength - left.metrics.textLength ||
    right.metrics.dishCount - left.metrics.dishCount ||
    right.metrics.priceCount - left.metrics.priceCount
  );
}

export async function getMenuSourceQualityMetrics(
  url: string,
  label = "",
  baseScore = 0
): Promise<MenuSourceQualityMetrics> {
  try {
    const menuText = await withTimeout(loadMenuTextFromUrl(url), MENU_TEXT_FETCH_TIMEOUT_MS, "");
    const trimmed = menuText.trim();
    const dishCount = parseMenu(trimmed).filter((dish) => dish.itemType !== "drink").length;
    const priceCount = countPriceSignals(trimmed);
    const score = scoreMenuSourceQuality({
      url,
      label,
      menuText: trimmed,
      textLength: trimmed.length,
      dishCount,
      priceCount,
      baseScore
    });

    return {
      textLength: trimmed.length,
      dishCount,
      priceCount,
      score
    };
  } catch {
    return {
      textLength: 0,
      dishCount: 0,
      priceCount: 0,
      score: scoreMenuSourceQuality({
        url,
        label,
        menuText: "",
        textLength: 0,
        dishCount: 0,
        priceCount: 0,
        baseScore
      })
    };
  }
}

function scoreMenuSourceQuality(input: {
  url: string;
  label: string;
  menuText: string;
  textLength: number;
  dishCount: number;
  priceCount: number;
  baseScore: number;
}) {
  const probe = normalizeQualityText(`${input.url} ${input.label} ${input.menuText.slice(0, 3000)}`);
  let score = input.baseScore;

  score += Math.min(Math.floor(input.textLength / 80), 220);
  score += Math.min(input.dishCount * 28, 360);
  score += Math.min(input.priceCount * 7, 180);

  if (hasAny(probe, ["a la carte", "alacarte", "speisekarte", "restaurant menu", "main menu", "food menu"])) score += 80;
  if (hasAny(probe, ["antipasti", "primi", "secondi", "pasta", "pizza", "carne", "pesce", "dolci"])) score += 70;
  if (hasAny(probe, ["vorspeisen", "hauptgerichte", "fleisch", "fisch", "dessert", "salate"])) score += 60;

  if (hasAny(probe, ["tasting", "degustation", "degustazione", "ueberraschungsmenu", "uberraschungsmenu"])) score -= 140;
  if (hasAny(probe, ["menu grande", "menu piccolo", "menue grande", "menue piccolo"])) score -= 100;
  if (hasAny(probe, ["weinkarte", "wine", "drinks", "cocktail", "beverages", "getraenke", "getranke"])) score -= 160;
  if (hasAny(probe, ["druck", "print"]) && input.textLength < 2500) score -= 40;
  if (input.textLength > 0 && input.textLength < 1200) score -= 120;
  if (input.dishCount > 0 && input.dishCount < 3) score -= 80;

  return score;
}

async function getCombinedMenuSourceQualityMetrics(
  candidate: MenuSourceQualityCandidate
): Promise<MenuSourceQualityMetrics> {
  const urls = uniqueStrings(candidate.urls?.length ? candidate.urls : [candidate.url]);
  const metrics = await Promise.all(urls.map((url) =>
    getMenuSourceQualityMetrics(url, candidate.label ?? "", candidate.baseScore ?? 0)
  ));
  const combined = metrics.reduce<MenuSourceQualityMetrics>((total, metric) => ({
    textLength: total.textLength + metric.textLength,
    dishCount: total.dishCount + metric.dishCount,
    priceCount: total.priceCount + metric.priceCount,
    score: total.score + metric.score
  }), {
    textLength: 0,
    dishCount: 0,
    priceCount: 0,
    score: 0
  });

  if (urls.length > 1) {
    combined.score += Math.min(urls.length * 35, 120);
  }

  return combined;
}

function countPriceSignals(value: string) {
  return (value.match(/(?:\u20ac|eur|euro)\s*\d+|\d+\s*(?:\u20ac|eur|euro)|\d+[,.]\d{2}/gi) ?? []).length;
}

function normalizeQualityText(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then(resolve)
      .catch(() => resolve(fallback))
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  });
}
