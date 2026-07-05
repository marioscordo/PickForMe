import type { RestaurantDiscoveryCandidate, RestaurantDiscoveryResult } from "./discoverRestaurantSource";

type SearchRestaurantCandidatesInput = {
  restaurantName: string;
  city: string;
};

type NominatimPlace = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
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
const MAX_SEARCH_QUERIES = 4;
const NOMINATIM_QUERY_DELAY_MS = 1100;
const NOMINATIM_FETCH_TIMEOUT_MS = 5000;
const SEARCH_USER_AGENT = "GustaroAI/1.0 restaurant-search (kontakt@gustaroai.com)";
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

export async function searchRestaurantCandidates(
  input: SearchRestaurantCandidatesInput
): Promise<RestaurantDiscoveryResult> {
  const restaurantName = input.restaurantName.trim();
  const city = input.city.trim();

  if (!restaurantName || !city) {
    return { candidates: [] };
  }

  const places: NominatimPlace[] = [];

  for (const [index, queryText] of buildRestaurantSearchQueries({ restaurantName, city }).entries()) {
    if (index > 0) {
      await delay(NOMINATIM_QUERY_DELAY_MS);
    }

    const query = encodeURIComponent(queryText);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${MAX_CANDIDATES}&addressdetails=1&extratags=1&q=${query}`;
    const response = await fetchWithTimeout(url, NOMINATIM_FETCH_TIMEOUT_MS);

    if (!response?.ok) continue;

    places.push(...((await response.json()) as NominatimPlace[]));
    if (places.length >= MAX_CANDIDATES) break;
  }

  return {
    candidates: dedupeCandidates(
      places
        .map(mapNominatimPlace)
        .filter((candidate): candidate is RestaurantDiscoveryCandidate => Boolean(candidate))
        .sort((a, b) => scoreCandidateMatch(b, { restaurantName, city }) - scoreCandidateMatch(a, { restaurantName, city }))
    ).slice(0, MAX_CANDIDATES)
  };
}

function mapNominatimPlace(place: NominatimPlace): RestaurantDiscoveryCandidate | null {
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
    address: formatNominatimAddress(place),
    ...(websiteUrl ? { websiteUrl } : {})
  };
}

function buildRestaurantSearchQueries(input: SearchRestaurantCandidatesInput) {
  const restaurantName = input.restaurantName.trim();
  const city = input.city.trim();
  const normalizedRestaurantName = normalizeSearchText(restaurantName);
  const normalizedCity = normalizeSearchText(city);
  const shortenedNames = getShortenedRestaurantNames(restaurantName);
  const cityAliases = getCityAliases(city);
  const queries = [
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

function stableCandidateId(place: NominatimPlace, name: string) {
  return String(place.place_id ?? `${place.osm_type ?? "place"}-${place.osm_id ?? name}`);
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
