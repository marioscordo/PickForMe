import type { RestaurantDiscoveryCandidate, RestaurantDiscoveryResult } from "./discoverRestaurantSource";
import {
  getRestaurantDiscoveryCountryCode,
  getRestaurantDiscoveryCountryNames,
  getRestaurantDiscoveryCountryTlds,
  getRestaurantDiscoveryNominatimCountryCode
} from "./restaurantDiscoveryCountries";

type SearchRestaurantCandidatesInput = {
  restaurantName: string;
  city: string;
  country?: string;
};

type NominatimPlace = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  category?: string;
  class?: string;
  type?: string;
  display_name?: string;
  name?: string;
  address?: {
    city?: string;
    city_district?: string;
    hamlet?: string;
    neighbourhood?: string;
    suburb?: string;
    town?: string;
    village?: string;
    municipality?: string;
    road?: string;
    house_number?: string;
  };
  extratags?: {
    website?: string;
    "contact:website"?: string;
    official_website?: string;
  };
};

const MAX_CANDIDATES = 5;
const MAX_SEARCH_QUERIES = 6;
const MAX_WEBSITE_RESOLVE_CANDIDATES = 3;
const MAX_WEBSITE_ORIGINS_TO_CHECK = 32;
const NOMINATIM_QUERY_DELAY_MS = 1100;
const NOMINATIM_FETCH_TIMEOUT_MS = 5000;
const WEBSITE_RESOLVE_TIMEOUT_MS = 5500;
const WEBSITE_FETCH_TIMEOUT_MS = 2600;
const SEARCH_USER_AGENT = "GustaroAI/1.0 restaurant-search (kontakt@gustaroai.com)";
const WEBSITE_FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
  "User-Agent": SEARCH_USER_AGENT
};
const BLOCKED_HOST_PARTS = [
  "facebook.",
  "instagram.",
  "tiktok.",
  "youtube.",
  "google.",
  "tripadvisor.",
  "yelp.",
  "opentable.",
  "thefork.",
  "lieferando.",
  "ubereats.",
  "wolt.",
  "doordash."
];
const GENERIC_RESTAURANT_WORDS = new Set([
  "restaurant",
  "ristorante",
  "trattoria",
  "pizzeria",
  "osteria",
  "gaststatte",
  "gasthof",
  "gasthaus",
  "cafe",
  "kafejnica",
  "auberge",
  "bistro",
  "brasserie",
  "bar"
]);
const DOMAIN_STOP_WORDS = new Set([
  ...GENERIC_RESTAURANT_WORDS,
  "da",
  "de",
  "di",
  "la",
  "le",
  "il",
  "el",
  "the",
  "a",
  "do"
]);
const COMMON_RESTAURANT_DOMAIN_WORDS = ["ristorante", "restaurant", "trattoria", "pizzeria", "osteria", "cafe", "bistro"];
const DOMAIN_ARTICLE_PREFIXES = ["il", "la", "le", "el", "the"];
const LIKELY_OFFICIAL_DOMAIN_TLDS = ["de", "com", "it", "fr", "es", "nl", "co.uk", "com.br"];
const PARKED_WEBSITE_TERMS = [
  "steht zum verkauf",
  "domain zum verkauf",
  "gebot abgeben",
  "domaininhaber",
  "marktplatzbroker",
  "buy this domain",
  "domain for sale",
  "this domain is for sale",
  "parking page"
];
const RESTAURANT_PLACE_TYPES = new Set([
  "bar",
  "biergarten",
  "cafe",
  "fast_food",
  "food_court",
  "ice_cream",
  "pub",
  "restaurant"
]);

export async function searchRestaurantCandidates(
  input: SearchRestaurantCandidatesInput
): Promise<RestaurantDiscoveryResult> {
  const restaurantName = input.restaurantName.trim();
  const city = input.city.trim();
  const country = getRestaurantDiscoveryCountryCode(input.country);

  if (!restaurantName || !city) {
    return { candidates: [] };
  }

  const places: NominatimPlace[] = [];

  for (const [index, queryText] of buildRestaurantSearchQueries({ restaurantName, city, country }).entries()) {
    if (index > 0) {
      await delay(NOMINATIM_QUERY_DELAY_MS);
    }

    const query = encodeURIComponent(queryText);
    const countryCodes = getRestaurantDiscoveryNominatimCountryCode(country);
    const countryCodesParam = countryCodes ? `&countrycodes=${encodeURIComponent(countryCodes)}` : "";
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${MAX_CANDIDATES}&addressdetails=1&extratags=1${countryCodesParam}&q=${query}`;
    const response = await fetchWithTimeout(url, NOMINATIM_FETCH_TIMEOUT_MS);

    if (!response?.ok) continue;

    places.push(...((await response.json()) as NominatimPlace[]));
    if (places.length >= MAX_CANDIDATES) break;
  }

  const candidates = dedupeCandidates(
    places
      .filter(isRestaurantPlace)
      .map((place) => mapNominatimPlace(place, country))
      .filter((candidate): candidate is RestaurantDiscoveryCandidate => Boolean(candidate))
      .sort((a, b) => scoreCandidateMatch(b, { restaurantName, city, country }) - scoreCandidateMatch(a, { restaurantName, city, country }))
  ).slice(0, MAX_CANDIDATES);
  const enrichedCandidates = await enrichCandidatesWithOfficialWebsites(candidates, { restaurantName, city, country });

  if (enrichedCandidates.length > 0) {
    return { candidates: enrichedCandidates };
  }

  const likelyOfficialCandidate = await resolveLikelyOfficialCandidate({ restaurantName, city, country });

  return {
    candidates: likelyOfficialCandidate ? [likelyOfficialCandidate] : []
  };
}

function mapNominatimPlace(place: NominatimPlace, country: string): RestaurantDiscoveryCandidate | null {
  const name = (place.name || firstDisplayNamePart(place.display_name)).trim();
  const city = getPrimaryLocality(place).trim();
  const websiteUrl = normalizeOfficialUrl(
    place.extratags?.website || place.extratags?.["contact:website"] || place.extratags?.official_website
  );

  if (!name) return null;

  return {
    id: stableCandidateId(place, name),
    name,
    city,
    ...(country ? { country } : {}),
    address: formatNominatimAddress(place),
    ...(websiteUrl ? { websiteUrl } : {})
  };
}

function isRestaurantPlace(place: NominatimPlace) {
  const category = normalizePlaceType(place.category ?? place.class);
  const type = normalizePlaceType(place.type);

  return category === "amenity" && RESTAURANT_PLACE_TYPES.has(type);
}

function buildRestaurantSearchQueries(input: SearchRestaurantCandidatesInput) {
  const restaurantName = input.restaurantName.trim();
  const city = input.city.trim();
  const normalizedRestaurantName = normalizeSearchText(restaurantName);
  const normalizedCity = normalizeSearchText(city);
  const shortenedNames = getShortenedRestaurantNames(restaurantName);
  const cityAliases = getCityAliases(city);
  const countryNames = getRestaurantDiscoveryCountryNames(input.country).slice(0, 1);
  const countryQueries = countryNames.flatMap((countryName) => [
    `${restaurantName} ${city} ${countryName}`,
    `Restaurant ${restaurantName} ${city} ${countryName}`,
    `${normalizedRestaurantName} ${normalizedCity} ${countryName}`
  ]);
  const queries = [
    ...countryQueries,
    `${restaurantName} ${city}`,
    `Restaurant ${restaurantName} ${city}`,
    `${normalizedRestaurantName} ${city}`,
    ...shortenedNames.flatMap((name) => [`${name} ${city}`, `${normalizeSearchText(name)} ${city}`]),
    `${restaurantName} ${normalizedCity}`,
    `${normalizedRestaurantName} ${normalizedCity}`,
    ...cityAliases.flatMap((cityAlias) => [`${restaurantName} ${cityAlias}`, `${normalizedRestaurantName} ${cityAlias}`])
  ];

  return uniqueStrings(queries).slice(0, MAX_SEARCH_QUERIES);
}

function getShortenedRestaurantNames(restaurantName: string) {
  const words = restaurantName.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return [];

  return [words.slice(0, 4).join(" "), words.slice(0, -1).join(" "), words.slice(0, -2).join(" ")];
}

function getCityAliases(city: string) {
  const normalizedCity = normalizeSearchText(city).toLowerCase();
  const aliases: Record<string, string[]> = {
    rom: ["Roma", "Rome"],
    rome: ["Roma", "Rom"],
    "sao paulo": ["Sao Paulo", "S\u00e3o Paulo"]
  };

  return aliases[normalizedCity] ?? [];
}

function scoreCandidateMatch(candidate: RestaurantDiscoveryCandidate, input: SearchRestaurantCandidatesInput) {
  const candidateName = normalizeSearchText(candidate.name).toLowerCase();
  const queryName = normalizeSearchText(input.restaurantName).toLowerCase();
  const candidateCity = normalizeSearchText(candidate.city).toLowerCase();
  const queryCity = normalizeSearchText(input.city).toLowerCase();
  let score = 0;

  if (candidateName === queryName) score += 4;
  if (candidateName.includes(queryName) || queryName.includes(candidateName)) score += 2;
  if (candidateCity === queryCity) score += 2;
  if (candidate.address && normalizeSearchText(candidate.address).toLowerCase().includes(queryCity)) score += 1;
  if (candidate.websiteUrl) score += 1;

  return score;
}

async function enrichCandidatesWithOfficialWebsites(
  candidates: RestaurantDiscoveryCandidate[],
  input: SearchRestaurantCandidatesInput
) {
  if (candidates.length === 0) return candidates;

  return withTimeout(
    Promise.all(
      candidates.map(async (candidate, index) => {
        if (candidate.websiteUrl || index >= MAX_WEBSITE_RESOLVE_CANDIDATES) return candidate;

        const websiteUrl = await resolveOfficialWebsiteUrl(candidate, input);
        return websiteUrl ? { ...candidate, websiteUrl } : candidate;
      })
    ),
    WEBSITE_RESOLVE_TIMEOUT_MS,
    candidates
  );
}

async function resolveOfficialWebsiteUrl(
  candidate: RestaurantDiscoveryCandidate,
  input: SearchRestaurantCandidatesInput
) {
  const origins = buildLikelyOfficialOrigins(candidate, input).slice(0, MAX_WEBSITE_ORIGINS_TO_CHECK);
  const probes = await Promise.all(origins.map(loadWebsiteSource));

  return probes
    .filter((probe): probe is { finalUrl: string; html: string } => Boolean(probe))
    .filter((probe) => sourceMatchesRestaurantWebsite(probe.html, probe.finalUrl, candidate, input))
    .map((probe) => getOriginUrl(probe.finalUrl))
    .find(Boolean) ?? "";
}

async function resolveLikelyOfficialCandidate(input: SearchRestaurantCandidatesInput) {
  const baseCandidate: RestaurantDiscoveryCandidate = {
    id: stableSyntheticCandidateId(input),
    name: input.restaurantName.trim(),
    city: input.city.trim(),
    ...(input.country ? { country: getRestaurantDiscoveryCountryCode(input.country) || input.country } : {})
  };
  const websiteUrl = await resolveOfficialWebsiteUrl(baseCandidate, input);

  return websiteUrl ? { ...baseCandidate, websiteUrl } : null;
}

function buildLikelyOfficialOrigins(
  candidate: RestaurantDiscoveryCandidate,
  input: SearchRestaurantCandidatesInput
) {
  const tlds = getLikelyOfficialDomainTlds(input.country || candidate.country, input.city || candidate.city);
  const slugs = uniqueStrings(
    [candidate.name, input.restaurantName]
      .flatMap(buildLikelyDomainSlugs)
      .filter(Boolean)
  );

  return uniqueStrings(
    slugs.flatMap((slug) => tlds.flatMap((tld) => [
      `https://www.${slug}.${tld}/`,
      `https://${slug}.${tld}/`
    ]))
  );
}

function getLikelyOfficialDomainTlds(country: string | undefined, city: string | undefined) {
  const countryTlds = getRestaurantDiscoveryCountryTlds(country);
  if (countryTlds.length > 0) {
    return uniqueStrings(countryTlds);
  }

  const normalizedCity = normalizeDomainText(city);
  const cityTokens = normalizedCity.split(" ").filter(Boolean);
  const cityPreferredTlds: Record<string, string[]> = {
    rom: ["it"],
    roma: ["it"],
    rome: ["it"]
  };
  const preferredTlds = [
    ...(cityPreferredTlds[normalizedCity] ?? []),
    ...cityTokens.flatMap((token) => cityPreferredTlds[token] ?? [])
  ];

  return uniqueStrings([
    ...preferredTlds,
    ...LIKELY_OFFICIAL_DOMAIN_TLDS
  ]);
}

function buildLikelyDomainSlugs(value: string) {
  const words = normalizeDomainText(value).split(" ").filter(Boolean);
  const meaningfulWords = words.filter((word) => !DOMAIN_STOP_WORDS.has(word));
  const firstGenericWord = words.find((word) => GENERIC_RESTAURANT_WORDS.has(word));
  const meaningfulSlug = meaningfulWords.join("-");
  const compactMeaningfulSlug = meaningfulWords.join("");
  const fullSlug = words.join("-");
  const compactFullSlug = words.join("");
  const articleRestaurantSlugs = DOMAIN_ARTICLE_PREFIXES.flatMap((article) => (
    COMMON_RESTAURANT_DOMAIN_WORDS.flatMap((restaurantWord) => [
      meaningfulSlug ? `${article}-${meaningfulSlug}-${restaurantWord}` : "",
      compactMeaningfulSlug ? `${article}${compactMeaningfulSlug}${restaurantWord}` : ""
    ])
  ));
  const restaurantWordSlugs = COMMON_RESTAURANT_DOMAIN_WORDS.flatMap((restaurantWord) => [
    meaningfulSlug ? `${restaurantWord}-${meaningfulSlug}` : "",
    compactMeaningfulSlug ? `${restaurantWord}${compactMeaningfulSlug}` : "",
    meaningfulSlug ? `${meaningfulSlug}-${restaurantWord}` : "",
    compactMeaningfulSlug ? `${compactMeaningfulSlug}${restaurantWord}` : ""
  ]);
  const articleSlugs = DOMAIN_ARTICLE_PREFIXES.flatMap((article) => [
    meaningfulSlug ? `${article}-${meaningfulSlug}` : "",
    compactMeaningfulSlug ? `${article}${compactMeaningfulSlug}` : ""
  ]);

  return uniqueStrings([
    meaningfulSlug,
    compactMeaningfulSlug,
    ...articleRestaurantSlugs,
    ...articleSlugs,
    ...restaurantWordSlugs,
    meaningfulSlug ? `restaurant-${meaningfulSlug}` : "",
    compactMeaningfulSlug ? `restaurant${compactMeaningfulSlug}` : "",
    firstGenericWord && meaningfulSlug ? `${firstGenericWord}-${meaningfulSlug}` : "",
    firstGenericWord && compactMeaningfulSlug ? `${firstGenericWord}${compactMeaningfulSlug}` : "",
    fullSlug,
    compactFullSlug
  ]);
}

async function loadWebsiteSource(sourceUrl: string) {
  const normalizedUrl = normalizeOfficialUrl(sourceUrl);
  if (!normalizedUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      headers: WEBSITE_FETCH_HEADERS,
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;

    return {
      finalUrl: normalizeOfficialUrl(response.url || normalizedUrl),
      html: await response.text()
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sourceMatchesRestaurantWebsite(
  html: string,
  finalUrl: string,
  candidate: RestaurantDiscoveryCandidate,
  input: SearchRestaurantCandidatesInput
) {
  const pageText = normalizeDomainText(htmlToPlainText(html));
  if (isLikelyParkedWebsiteSource(pageText, finalUrl)) return false;

  const sourceText = `${pageText} ${normalizeDomainText(finalUrl)}`;
  const domainText = normalizeDomainText(finalUrl).replace(/\s+/g, "");
  const nameTokens = uniqueStrings([
    ...meaningfulRestaurantTokens(candidate.name),
    ...meaningfulRestaurantTokens(input.restaurantName)
  ]);
  const addressTokens = meaningfulAddressTokens(candidate.address);
  const localityTokens = meaningfulLocalityTokens([candidate.city, candidate.address, input.city]);

  const hasNameEvidence =
    nameTokens.length === 0 ||
    nameTokens.some((token) => sourceText.includes(token)) ||
    nameTokens.some((token) => domainText.includes(token));
  const hasLocationEvidence = addressTokens.length > 0
    ? addressTokens.some((token) => pageText.includes(token))
    : localityTokens.length === 0 || localityTokens.some((token) => pageText.includes(token));

  return hasNameEvidence && hasLocationEvidence;
}

function isLikelyParkedWebsiteSource(pageText: string, finalUrl: string) {
  const host = safeHostname(finalUrl);
  const hits = PARKED_WEBSITE_TERMS.filter((term) => pageText.includes(term)).length;

  return hits >= 2 ||
    pageText.includes("steht zum verkauf") ||
    pageText.includes("buy this domain") ||
    pageText.includes("domain for sale") ||
    (host.includes("domain") && hits >= 1);
}

function meaningfulRestaurantTokens(value: string | undefined) {
  return normalizeDomainText(value)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => !GENERIC_RESTAURANT_WORDS.has(token))
    .filter((token) => !DOMAIN_STOP_WORDS.has(token));
}

function meaningfulLocalityTokens(values: Array<string | undefined>) {
  return values
    .flatMap((value) => normalizeDomainText(value).split(" "))
    .filter((token) => token.length >= 4)
    .filter((token) => !/^\d+$/.test(token));
}

function meaningfulAddressTokens(value: string | undefined) {
  const streetPart = value?.split(",")[0] ?? "";
  return normalizeDomainText(streetPart)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => !/^\d+$/.test(token));
}

function formatNominatimAddress(place: NominatimPlace) {
  const road = place.address?.road;
  const houseNumber = place.address?.house_number;
  const localities = uniqueStrings([
    getPrimaryLocality(place),
    place.address?.municipality ?? "",
    place.address?.city ?? ""
  ]);

  return [road && [road, houseNumber].filter(Boolean).join(" "), ...localities].filter(Boolean).join(", ") || place.display_name || "";
}

function firstDisplayNamePart(displayName: string | undefined) {
  return displayName?.split(",")[0] ?? "";
}

function getPrimaryLocality(place: NominatimPlace) {
  return (
    place.address?.village ||
    place.address?.suburb ||
    place.address?.hamlet ||
    place.address?.neighbourhood ||
    place.address?.city_district ||
    place.address?.town ||
    place.address?.city ||
    place.address?.municipality ||
    ""
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlaceType(value: string | undefined) {
  return normalizeSearchText(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDomainText(value: string | undefined) {
  return normalizeSearchText(value ?? "")
    .replace(/\u00df/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToPlainText(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&auml;/gi, "\u00e4")
    .replace(/&ouml;/gi, "\u00f6")
    .replace(/&uuml;/gi, "\u00fc")
    .replace(/&Auml;/gi, "\u00c4")
    .replace(/&Ouml;/gi, "\u00d6")
    .replace(/&Uuml;/gi, "\u00dc")
    .replace(/&szlig;/gi, "\u00df")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOfficialUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (isBlockedHost(url.hostname)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isBlockedHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return BLOCKED_HOST_PARTS.some((blockedPart) => normalized.includes(blockedPart));
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getOriginUrl(value: string) {
  const normalized = normalizeOfficialUrl(value);
  if (!normalized) return "";

  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

function stableCandidateId(place: NominatimPlace, name: string) {
  return String(place.place_id ?? `${place.osm_type ?? "place"}-${place.osm_id ?? name}`);
}

function stableSyntheticCandidateId(input: SearchRestaurantCandidatesInput) {
  return `official-${normalizeDomainText(`${input.restaurantName} ${input.city} ${input.country ?? ""}`)
    .replace(/\s+/g, "-")
    .slice(0, 100)}`;
}

function dedupeCandidates(candidates: RestaurantDiscoveryCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [candidate.name, candidate.city, candidate.address].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

async function fetchWithTimeout(value: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      headers: {
        Accept: "application/json",
        "User-Agent": SEARCH_USER_AGENT
      },
      signal: controller.signal
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promise
      .then(resolve)
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
