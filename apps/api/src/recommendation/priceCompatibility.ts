import type { MainDishAIRecommendation } from "../ai/twoStepRecommendationSchemas";
import type { Dish } from "../types/menu";
import type { Recommendation } from "../types/recommendations";
import type { TwoStepAnalyzeDataParts } from "./twoStepRecommendationMappers";

export type PriceCompatibilityCurrency = "EUR" | "CHF" | "USD" | "MXN" | "RUB" | "INR" | "IDR" | "EGP" | "GBP" | "UNKNOWN";

type PriceCompatibilityInput = {
  acceptedRecommendations: MainDishAIRecommendation[];
  data: TwoStepAnalyzeDataParts;
  deviceLocale?: string;
  menuLanguage?: string;
  sourceContext?: string;
  targetLocale?: string;
};

export type PriceResolverDiagnostics = {
  priceResolverEvaluatedCount: number;
  priceResolverSkippedCount: number;
  priceResolverMxnCount: number;
  priceResolverUsdCount: number;
  priceResolverUnknownCount: number;
  priceResolverExplicitCount: number;
  priceResolverContextCount: number;
  priceResolverApproxGeneratedCount: number;
  priceResolverApproxMissingCount: number;
  priceResolverMexicoMarkerCount: number;
  priceResolverMexicanPesoMarkerCount: number;
  priceResolverMxDomainMarkerCount: number;
};

export type PriceCompatibilityResult = TwoStepAnalyzeDataParts & {
  priceResolverDiagnostics: PriceResolverDiagnostics;
};

type PriceParts = {
  approximate?: boolean;
  amounts: number[];
  currency: PriceCompatibilityCurrency;
  currencySource: "explicit" | "context" | "unknown";
  raw: string;
};

type ExchangeRateEntry = {
  date: string;
  fetchedAt: number;
  rate: number;
};

const EXCHANGE_RATE_CACHE = new Map<string, ExchangeRateEntry>();
const EXCHANGE_RATE_TTL_MS = 24 * 60 * 60 * 1000;
const EXCHANGE_RATE_STALE_MS = 7 * EXCHANGE_RATE_TTL_MS;
const SUPPORTED_TARGET_CURRENCIES = new Set<PriceCompatibilityCurrency>(["EUR", "CHF", "USD", "RUB", "INR", "IDR", "EGP", "GBP"]);

export async function enrichPriceCompatibility({
  acceptedRecommendations,
  data,
  deviceLocale,
  menuLanguage,
  sourceContext,
  targetLocale
}: PriceCompatibilityInput): Promise<PriceCompatibilityResult> {
  const targetCurrency = resolveTargetCurrencyFromDeviceLocale(deviceLocale) ?? resolveTargetCurrencyFromDeviceLocale(targetLocale);
  const diagnostics = createPriceResolverDiagnostics();
  const pricePartsByDishId = new Map<string, PriceParts>();
  const sourceCurrencyFallback = inferSourceCurrencyFromContext(sourceContext) ?? inferSourceCurrencyFromMenuLanguage(menuLanguage);

  logDevPriceResolver({
    phase: "target_currency_resolved",
    deviceLocale,
    targetLocale,
    targetCurrency: targetCurrency ?? "none"
  });

  acceptedRecommendations.forEach((item, index) => {
    const dishId = data.dishes[index]?.id;
    const priceParts = parsePriceParts(item.priceRaw, sourceCurrencyFallback, sourceContext, diagnostics);

    if (dishId && priceParts) {
      pricePartsByDishId.set(dishId, priceParts);
    }
  });

  const currencyPairs = uniqueCurrencyPairs([...pricePartsByDishId.values()], targetCurrency);
  const rates = new Map<string, ExchangeRateEntry>();

  for (const pair of currencyPairs) {
    const fetchStartedAt = Date.now();
    const rate = await getExchangeRate(pair.sourceCurrency, pair.targetCurrency);

    logDevPriceResolver({
      phase: "exchange_rate_fetch",
      sourceCurrency: pair.sourceCurrency,
      targetCurrency: pair.targetCurrency,
      durationMs: Date.now() - fetchStartedAt,
      success: Boolean(rate)
    });

    if (rate) {
      rates.set(currencyPairKey(pair.sourceCurrency, pair.targetCurrency), rate);
    }
  }

  const dishes = data.dishes.map((dish) => {
    const priceParts = pricePartsByDishId.get(dish.id);
    if (!priceParts) return dish;

    return enrichDishPrice({
      dish,
      diagnostics,
      priceParts,
      rates,
      targetCurrency,
      locale: deviceLocale ?? targetLocale
    });
  });
  const enrichedDishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const recommendations = data.recommendations.map((recommendation) => {
    const dish = enrichedDishById.get(recommendation.dishId);
    if (!dish?.priceDisplay) return recommendation;

    return {
      ...recommendation,
      priceOriginal: dish.priceOriginal,
      priceCurrency: dish.priceCurrency,
      priceDisplay: dish.priceDisplay,
      priceApproxDisplay: dish.priceApproxDisplay,
      priceExchangeRateDate: dish.priceExchangeRateDate
    };
  });

  return {
    dishes,
    recommendations,
    priceResolverDiagnostics: diagnostics
  };
}

export function parsePriceParts(
  priceRaw: string | null | undefined,
  fallbackCurrency?: PriceCompatibilityCurrency,
  sourceContext?: string,
  diagnostics?: PriceResolverDiagnostics
): PriceParts | null {
  const raw = priceRaw?.trim();
  if (!raw) {
    if (diagnostics) {
      diagnostics.priceResolverSkippedCount++;
    }
    return null;
  }

  const explicitCurrency = inferCurrencyFromPriceRaw(raw);
  const contextualCurrency = resolveAmbiguousDollarCurrency(raw, sourceContext) ??
    inferSourceCurrencyFromContext(sourceContext) ??
    fallbackCurrency;
  const currency = explicitCurrency ?? contextualCurrency ?? "UNKNOWN";
  const currencySource = explicitCurrency ? "explicit" : contextualCurrency ? "context" : "unknown";
  const amounts = extractPriceAmounts(raw, currency);
  recordPriceResolverDiagnostics({
    currency,
    diagnostics,
    explicitCurrency,
    raw,
    sourceContext
  });

  if (amounts.length === 0) {
    return {
      raw,
      currency,
      currencySource,
      amounts: []
    };
  }

  return {
    raw,
    currency,
    currencySource,
    amounts,
    approximate: /\b(?:ca\.?|approx\.?|about|around)\b|≈|~/.test(raw.toLowerCase())
  };
}

export function resolveTargetCurrencyFromDeviceLocale(locale: string | undefined): PriceCompatibilityCurrency | undefined {
  const region = locale?.replace(/_/g, "-").split("-")[1]?.toUpperCase();

  switch (region) {
    case "AT":
    case "BE":
    case "CY":
    case "DE":
    case "EE":
    case "ES":
    case "FI":
    case "FR":
    case "GR":
    case "HR":
    case "IE":
    case "IT":
    case "LT":
    case "LU":
    case "LV":
    case "MT":
    case "NL":
    case "PT":
    case "SI":
    case "SK":
      return "EUR";
    case "CH":
    case "LI":
      return "CHF";
    case "US":
      return "USD";
    case "RU":
      return "RUB";
    case "IN":
      return "INR";
    case "ID":
      return "IDR";
    case "EG":
      return "EGP";
    case "GB":
      return "GBP";
    default:
      return undefined;
  }
}

export function inferCurrencyFromPriceRaw(value: string): PriceCompatibilityCurrency | undefined {
  const normalized = value.toLowerCase();

  if (/[€]|(?:^|[\s\d.,])eur(?:$|[\s\d.,])|\beuro\b/i.test(value)) return "EUR";
  if (/\bchf\b|\bsfr\.?\b/i.test(value)) return "CHF";
  if (/\busd\b|\bus\s*\$/i.test(value)) return "USD";
  if (/\bmxn\b|\bmx\s*\$/i.test(value)) return "MXN";
  if (/₽|\brub\b|руб\.?/i.test(value)) return "RUB";
  if (/₹|\binr\b|\brs\.?\b/i.test(value)) return "INR";
  if (/\bidr\b|\brp\.?\b|\brupiah\b/i.test(value)) return "IDR";
  if (/\begp\b|e£|\ble\b|ج\.م/i.test(value)) return "EGP";
  if (normalized.includes("£") || /\bgbp\b/i.test(value)) return "GBP";

  return undefined;
}

export function inferSourceCurrencyFromContext(value: string | undefined): PriceCompatibilityCurrency | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  const comparable = normalizeCurrencyContextText(value);
  const hostMatches = Array.from(normalized.matchAll(/https?:\/\/([^/\s"')]+)/g)).map((match) => match[1] ?? "");
  const hosts = hostMatches.length > 0 ? hostMatches : [normalized];

  if (hasMexicanPesoContext(comparable, hosts)) return "MXN";
  if (hasIndiaContext(comparable, hosts)) return "INR";
  if (hasIndonesiaContext(comparable, hosts)) return "IDR";
  if (hosts.some((host) => /\.ru(?::\d+)?$/.test(host))) return "RUB";
  if (hosts.some((host) => /\.in(?::\d+)?$/.test(host))) return "INR";
  if (hosts.some((host) => /\.id(?::\d+)?$/.test(host))) return "IDR";
  if (hosts.some((host) => /\.eg(?::\d+)?$/.test(host))) return "EGP";
  if (hosts.some((host) => /\.ch(?::\d+)?$/.test(host))) return "CHF";
  if (hosts.some((host) => /\.us(?::\d+)?$/.test(host))) return "USD";
  if (hosts.some((host) => hasEuroCountryDomain(host))) return "EUR";

  return undefined;
}

export function inferSourceCurrencyFromMenuLanguage(menuLanguage: string | undefined): PriceCompatibilityCurrency | undefined {
  if (menuLanguage === "ru") return "RUB";
  if (menuLanguage === "id") return "IDR";

  return undefined;
}

function enrichDishPrice({
  dish,
  diagnostics,
  priceParts,
  rates,
  targetCurrency,
  locale
}: {
  dish: Dish;
  diagnostics?: PriceResolverDiagnostics;
  priceParts: PriceParts;
  rates: Map<string, ExchangeRateEntry>;
  targetCurrency?: PriceCompatibilityCurrency;
  locale?: string;
}): Dish {
  if (priceParts.currency !== "UNKNOWN" && priceParts.currency === targetCurrency) {
    if (
      priceParts.currency === "EUR" &&
      priceParts.currencySource === "context" &&
      isPlainNumericPrice(priceParts.raw) &&
      typeof dish.price !== "number" &&
      priceParts.amounts.length === 1
    ) {
      return {
        ...dish,
        price: priceParts.amounts[0],
        priceOriginal: priceParts.raw,
        priceCurrency: priceParts.currency
      };
    }

    return dish;
  }

  if (priceParts.currency === "UNKNOWN" && isPlainNumericPrice(priceParts.raw)) {
    return dish;
  }

  const priceDisplay = formatOriginalPrice(priceParts);

  if (!priceDisplay) {
    return dish;
  }

  const next: Dish = {
    ...dish,
    priceOriginal: priceParts.raw,
    priceCurrency: priceParts.currency,
    priceDisplay
  };

  if (
    targetCurrency &&
    priceParts.currency !== "UNKNOWN" &&
    priceParts.amounts.length > 0 &&
    SUPPORTED_TARGET_CURRENCIES.has(targetCurrency)
  ) {
    const rate = rates.get(currencyPairKey(priceParts.currency, targetCurrency));

    if (rate) {
      next.priceApproxDisplay = formatApproximatePrice({
        amounts: priceParts.amounts.map((amount) => amount * rate.rate),
        currency: targetCurrency,
        locale
      });
      next.priceExchangeRateDate = rate.date;
      if (diagnostics) {
        diagnostics.priceResolverApproxGeneratedCount++;
      }
    } else if (diagnostics) {
      diagnostics.priceResolverApproxMissingCount++;
    }
  }

  return next;
}

function hasEuroCountryDomain(host: string) {
  return /\.(?:at|be|cy|de|ee|es|fi|fr|gr|hr|ie|it|lt|lu|lv|mt|nl|pt|si|sk)(?::\d+)?$/.test(host);
}

function resolveAmbiguousDollarCurrency(
  raw: string,
  sourceContext: string | undefined
): PriceCompatibilityCurrency | undefined {
  if (!hasAmbiguousDollarPrice(raw)) {
    return undefined;
  }

  return inferSourceCurrencyFromContext(sourceContext) ?? "UNKNOWN";
}

function hasMexicanPesoContext(comparable: string, hosts: string[]) {
  return hasMexicanPesoTextMarker(comparable) ||
    hasMexicoTextMarker(comparable) ||
    hasMxDomainMarker(hosts);
}

function hasIndiaContext(comparable: string, hosts: string[]) {
  return /\b(?:new\s+delhi|neu\s+delhi|delhi|india|indien)\b/.test(comparable) ||
    hosts.some((host) => /\.in(?::\d+)?$/.test(host));
}

function hasIndonesiaContext(comparable: string, hosts: string[]) {
  return /\b(?:idr|rupiah|rp\.?)\b/.test(comparable) ||
    hosts.some((host) => /\.id(?::\d+)?$/.test(host));
}

function hasAmbiguousDollarPrice(value: string) {
  return /\$/.test(value) && !inferCurrencyFromPriceRaw(value);
}

function normalizeCurrencyContextText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function createPriceResolverDiagnostics(): PriceResolverDiagnostics {
  return {
    priceResolverEvaluatedCount: 0,
    priceResolverSkippedCount: 0,
    priceResolverMxnCount: 0,
    priceResolverUsdCount: 0,
    priceResolverUnknownCount: 0,
    priceResolverExplicitCount: 0,
    priceResolverContextCount: 0,
    priceResolverApproxGeneratedCount: 0,
    priceResolverApproxMissingCount: 0,
    priceResolverMexicoMarkerCount: 0,
    priceResolverMexicanPesoMarkerCount: 0,
    priceResolverMxDomainMarkerCount: 0
  };
}

function recordPriceResolverDiagnostics({
  currency,
  diagnostics,
  explicitCurrency,
  raw,
  sourceContext
}: {
  currency: PriceCompatibilityCurrency;
  diagnostics?: PriceResolverDiagnostics;
  explicitCurrency?: PriceCompatibilityCurrency;
  raw: string;
  sourceContext?: string;
}) {
  if (!diagnostics) return;

  diagnostics.priceResolverEvaluatedCount++;

  if (currency === "MXN") diagnostics.priceResolverMxnCount++;
  if (currency === "USD") diagnostics.priceResolverUsdCount++;
  if (currency === "UNKNOWN") diagnostics.priceResolverUnknownCount++;

  if (explicitCurrency) {
    diagnostics.priceResolverExplicitCount++;
    return;
  }

  if (!hasAmbiguousDollarPrice(raw)) {
    return;
  }

  const markers = getMexicanPesoContextMarkers(sourceContext);
  if (currency !== "UNKNOWN") {
    diagnostics.priceResolverContextCount++;
  }
  if (markers.hasMexicanPesoText) diagnostics.priceResolverMexicanPesoMarkerCount++;
  if (markers.hasMexicoText) diagnostics.priceResolverMexicoMarkerCount++;
  if (markers.hasMxDomain) diagnostics.priceResolverMxDomainMarkerCount++;
}

function getMexicanPesoContextMarkers(value: string | undefined) {
  if (!value) {
    return {
      hasMexicanPesoText: false,
      hasMexicoText: false,
      hasMxDomain: false
    };
  }

  const normalized = value.toLowerCase();
  const comparable = normalizeCurrencyContextText(value);
  const hostMatches = Array.from(normalized.matchAll(/https?:\/\/([^/\s"')]+)/g)).map((match) => match[1] ?? "");
  const hosts = hostMatches.length > 0 ? hostMatches : [normalized];

  return {
    hasMexicanPesoText: hasMexicanPesoTextMarker(comparable),
    hasMexicoText: hasMexicoTextMarker(comparable),
    hasMxDomain: hasMxDomainMarker(hosts)
  };
}

function hasMexicanPesoTextMarker(comparable: string) {
  return /\bmxn\b/.test(comparable) ||
    /\bmx\s*\$/.test(comparable) ||
    /\bpesos?\s+mexicanos?\b/.test(comparable) ||
    /\bprecios?\s+en\s+pesos?\s+mexicanos?\b/.test(comparable);
}

function hasMexicoTextMarker(comparable: string) {
  return /\bmexico\b/.test(comparable);
}

function hasMxDomainMarker(hosts: string[]) {
  return hosts.some((host) => /\.mx(?::\d+)?$/.test(host) || /\.com\.mx(?::\d+)?$/.test(host));
}

function isPlainNumericPrice(value: string) {
  return /^\s*\d+(?:[,.]\d{1,2})?\s*$/.test(value);
}

function extractPriceAmounts(value: string, currency: PriceCompatibilityCurrency): number[] {
  const matches = currency === "IDR" && /\b\d+(?:[.,]\d{1,2})?\s*k\b/i.test(value)
    ? Array.from(value.matchAll(/\b\d+(?:[.,]\d{1,2})?\s*k\b/gi)).map((match) => match[0])
    : value.match(/\d+(?:[.,]\d{1,2})?/g) ?? [];
  return matches
    .slice(0, 2)
    .map((match) => {
      const amount = Number(match.replace(/\s*k\b/i, "").replace(",", "."));
      return currency === "IDR" && /k\b/i.test(match) ? amount * 1000 : amount;
    })
    .filter((amount) => Number.isFinite(amount));
}

function formatOriginalPrice(priceParts: PriceParts) {
  const cleaned = priceParts.raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;

  if (priceParts.currency === "UNKNOWN" || inferCurrencyFromPriceRaw(cleaned)) {
    return cleaned;
  }

  if (priceParts.currency === "MXN" && hasAmbiguousDollarPrice(cleaned)) {
    return formatResolvedMexicanPesoPrice(cleaned);
  }

  if (priceParts.currency === "INR" && priceParts.currencySource === "context") {
    return `vermutlich INR ${cleaned}`;
  }

  const symbol = currencySymbol(priceParts.currency);
  return symbol ? `${cleaned} ${symbol}` : cleaned;
}

function formatResolvedMexicanPesoPrice(value: string) {
  if (/^\$\s*/.test(value)) {
    return value.replace(/^\$\s*/, "MX$");
  }

  if (/\s*\$$/.test(value)) {
    return value.replace(/\s*\$$/, " MX$");
  }

  return value;
}

function formatApproximatePrice({
  amounts,
  currency,
  locale
}: {
  amounts: number[];
  currency: PriceCompatibilityCurrency;
  locale?: string;
}) {
  const prefix = locale?.toLowerCase().startsWith("de") ? "ca." : "approx.";
  const formatter = new Intl.NumberFormat(locale ?? "de-DE", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency"
  });
  const formattedAmounts = amounts.slice(0, 2).map((amount) => formatter.format(amount));

  return `${prefix} ${formattedAmounts.join("–")}`;
}

function currencySymbol(currency: PriceCompatibilityCurrency) {
  switch (currency) {
    case "EUR":
      return "€";
    case "CHF":
      return "CHF";
    case "USD":
      return "$";
    case "MXN":
      return "MX$";
    case "RUB":
      return "₽";
    case "INR":
      return "₹";
    case "IDR":
      return "IDR";
    case "EGP":
      return "EGP";
    case "GBP":
      return "£";
    default:
      return undefined;
  }
}

function uniqueCurrencyPairs(values: PriceParts[], targetCurrency: PriceCompatibilityCurrency | undefined) {
  if (!targetCurrency || !SUPPORTED_TARGET_CURRENCIES.has(targetCurrency)) {
    return [];
  }

  const seen = new Set<string>();
  const pairs: Array<{ sourceCurrency: PriceCompatibilityCurrency; targetCurrency: PriceCompatibilityCurrency }> = [];

  for (const value of values) {
    if (value.currency === "UNKNOWN" || value.currency === targetCurrency || value.amounts.length === 0) {
      continue;
    }

    const key = currencyPairKey(value.currency, targetCurrency);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ sourceCurrency: value.currency, targetCurrency });
  }

  return pairs;
}

// Kein API-Key, keine Retry-Infrastruktur beim Anbieter - ein einzelner
// Ausreißer (Timeout, kurzer Netzwerkfehler) hat vorher die gesamte
// €-Umrechnung fuer den Request stillschweigend entfernt (priceDisplay blieb,
// priceApproxDisplay fehlte einfach - kein Fehler, keine Warnung). Ein
// zweiter Versuch mit frischem Timeout-Budget faengt genau diesen Fall ab,
// ohne einen zusaetzlichen Fetch-Pfad einzufuehren - es bleibt bei einer
// einzigen Aufrufstelle der Timeout-Helper-Funktion, nur in einer Schleife.
const EXCHANGE_RATE_FETCH_TIMEOUT_MS = 2500;
const EXCHANGE_RATE_MAX_ATTEMPTS = 2;

async function getExchangeRate(
  sourceCurrency: PriceCompatibilityCurrency,
  targetCurrency: PriceCompatibilityCurrency
): Promise<ExchangeRateEntry | null> {
  const key = currencyPairKey(sourceCurrency, targetCurrency);
  const cached = EXCHANGE_RATE_CACHE.get(key);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < EXCHANGE_RATE_TTL_MS) {
    return cached;
  }

  for (let attempt = 1; attempt <= EXCHANGE_RATE_MAX_ATTEMPTS; attempt++) {
    const entry = await fetchExchangeRateOnce(sourceCurrency, targetCurrency, now);

    if (entry) {
      EXCHANGE_RATE_CACHE.set(key, entry);
      return entry;
    }
  }

  return cached && now - cached.fetchedAt < EXCHANGE_RATE_STALE_MS ? cached : null;
}

async function fetchExchangeRateOnce(
  sourceCurrency: PriceCompatibilityCurrency,
  targetCurrency: PriceCompatibilityCurrency,
  fetchedAt: number
): Promise<ExchangeRateEntry | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.frankfurter.dev/v2/rate/${sourceCurrency}/${targetCurrency}`,
      EXCHANGE_RATE_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as { date?: string; rate?: number };

    if (!payload.date || typeof payload.rate !== "number" || !Number.isFinite(payload.rate)) {
      return null;
    }

    return {
      date: payload.date,
      fetchedAt,
      rate: payload.rate
    };
  } catch {
    return null;
  }
}

// Nur fuer die Fehlersuche: bisher gab es keinen sichtbaren Hinweis darauf,
// ob eine fehlende Umrechnung (kein priceApproxDisplay) daran lag, dass die
// Zielwaehrung nicht bestimmt werden konnte (z.B. Geraete-Locale ohne
// Region), oder daran, dass der Kursabruf selbst fehlgeschlagen ist. Beides
// fuehrte bisher zum selben, stillen Ergebnis: keine €-Anzeige, kein Log.
type DevPriceResolverValue = string | number | boolean | undefined;

function logDevPriceResolver(fields: Record<string, DevPriceResolverValue>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_DEV_PRICE_RESOLVER] ${payload}`);
}

function currencyPairKey(sourceCurrency: PriceCompatibilityCurrency, targetCurrency: PriceCompatibilityCurrency) {
  return `${sourceCurrency}_${targetCurrency}`;
}

async function fetchWithTimeout(value: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      redirect: "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
