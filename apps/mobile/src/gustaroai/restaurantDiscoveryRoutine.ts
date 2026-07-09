import { discoverRestaurantMenu, discoverRestaurants } from "../api/pickformeApi";

export type RestaurantDiscoveryInput = {
  restaurantName: string;
  city: string;
  country?: string;
};

export type RestaurantCandidate = {
  id: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  websiteUrl?: string;
  menuUrl?: string;
};

export type RestaurantSourceLink = {
  url: string;
  kind: "menu" | "other";
};

export type SelectedRestaurantSource = {
  websiteUrl: string;
  menuUrl?: string;
};

export type RestaurantDiscoveryProvider = {
  name: string;
  searchRestaurants(input: RestaurantDiscoveryInput): Promise<RestaurantCandidate[]>;
  loadCandidateLinks(candidate: RestaurantCandidate): Promise<RestaurantSourceLink[]>;
  validateUrl(url: string): Promise<boolean>;
};

type NominatimPlace = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  name?: string;
  address?: {
    city?: string;
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

const DISCOVERY_LIMIT = 8;
const MAX_DISCOVERY_QUERIES = 6;
const MAX_LINKS_PER_PAGE = 40;
const MAX_CRAWL_PAGES = 12;
const NOMINATIM_QUERY_DELAY_MS = 1100;
const DISCOVERY_USER_AGENT = "GustaroAI/1.0 restaurant-discovery (kontakt@gustaroai.com)";
const DISCOVERY_FETCH_HEADERS = {
  Accept: "application/json",
  "User-Agent": DISCOVERY_USER_AGENT
};
const SECOND_LEVEL_DOMAIN_SUFFIXES = new Set(["co.uk", "org.uk", "com.br", "com.ar", "com.au", "co.jp", "com.mx"]);
const PAGE_FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.2",
  "User-Agent": DISCOVERY_USER_AGENT
};

export async function generateRestaurantCandidates(
  input: RestaurantDiscoveryInput,
  provider: RestaurantDiscoveryProvider = gustaroaiRestaurantDiscoveryProvider
): Promise<RestaurantCandidate[]> {
  const restaurantName = input.restaurantName.trim();
  const city = input.city.trim();

  if (!restaurantName || !city) {
    return [];
  }

  const candidates = await provider.searchRestaurants({ restaurantName, city });
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = [candidate.name, candidate.city, candidate.address].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolveSelectedRestaurantSource(
  candidate: RestaurantCandidate,
  provider: RestaurantDiscoveryProvider = gustaroaiRestaurantDiscoveryProvider
): Promise<SelectedRestaurantSource> {
  const websiteUrl = normalizeOfficialUrl(candidate.websiteUrl);
  const websiteDomain = getRegistrableDomain(websiteUrl);
  const links = await provider.loadCandidateLinks({ ...candidate, ...(websiteUrl ? { websiteUrl } : {}) });

  for (const link of links) {
    if (link.kind !== "menu") continue;

    const menuUrl = normalizeOfficialUrl(link.url, websiteUrl || undefined);
    if (!menuUrl) continue;
    if (websiteUrl) {
      if (getRegistrableDomain(menuUrl) !== websiteDomain) continue;
      if (!(await provider.validateUrl(menuUrl))) continue;
    }

    return { websiteUrl, menuUrl };
  }

  return { websiteUrl };
}

export const gustaroaiRestaurantDiscoveryProvider: RestaurantDiscoveryProvider = {
  name: "gustaroai-api",

  async searchRestaurants(input) {
    const result = await discoverRestaurants(input);
    return result.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      city: candidate.city,
      country: candidate.country,
      address: candidate.address,
      websiteUrl: candidate.websiteUrl,
      menuUrl: candidate.menuUrl
    }));
  },

  async loadCandidateLinks(candidate) {
    if (candidate.menuUrl) {
      return [{ url: candidate.menuUrl, kind: "menu" }];
    }

    const result = await discoverRestaurantMenu(candidate);
    return result.menuUrl ? [{ url: result.menuUrl, kind: "menu" }] : [];
  },

  async validateUrl(url) {
    return nominatimRestaurantDiscoveryProvider.validateUrl(url);
  }
};

export const nominatimRestaurantDiscoveryProvider: RestaurantDiscoveryProvider = {
  name: "openstreetmap-nominatim",

  async searchRestaurants(input) {
    const places: NominatimPlace[] = [];

    const queries = buildRestaurantSearchQueries(input);

    for (const [index, queryText] of queries.entries()) {
      if (index > 0) {
        await delay(NOMINATIM_QUERY_DELAY_MS);
      }

      const query = encodeURIComponent(queryText);
      const countryCode = getNominatimCountryCode(input.country);
      const countryCodeParam = countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : "";
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${DISCOVERY_LIMIT}&addressdetails=1&extratags=1${countryCodeParam}&q=${query}`;
      const response = await fetch(url, { headers: DISCOVERY_FETCH_HEADERS });

      if (!response.ok) {
        continue;
      }

      places.push(...((await response.json()) as NominatimPlace[]));
      if (places.length >= DISCOVERY_LIMIT) break;
    }

    return places
      .map((place) => mapNominatimPlace(place, input.country))
      .filter((candidate): candidate is RestaurantCandidate => Boolean(candidate))
      .sort((a, b) => scoreCandidateMatch(b, input) - scoreCandidateMatch(a, input));
  },

  async loadCandidateLinks(candidate) {
    const websiteUrl = normalizeOfficialUrl(candidate.websiteUrl);
    if (!websiteUrl) return [];

    try {
      const response = await fetch(websiteUrl, { headers: PAGE_FETCH_HEADERS });
      if (!response.ok) return [];

      return collectSameDomainMenuLinks(response, websiteUrl);
    } catch {
      return [];
    }
  },

  async validateUrl(url) {
    try {
      const response = await fetch(url, { method: "HEAD", headers: PAGE_FETCH_HEADERS });
      return response.ok;
    } catch {
      try {
        const response = await fetch(url, { headers: PAGE_FETCH_HEADERS });
        return response.ok;
      } catch {
        return false;
      }
    }
  }
};

function mapNominatimPlace(place: NominatimPlace, country: string | undefined): RestaurantCandidate | null {
  const name = (place.name || firstDisplayNamePart(place.display_name)).trim();
  const city = (place.address?.city || place.address?.town || place.address?.village || place.address?.municipality || "").trim();
  const websiteUrl = normalizeOfficialUrl(
    place.extratags?.website || place.extratags?.["contact:website"] || place.extratags?.official_website
  );

  if (!name) return null;

  return {
    id: String(place.place_id ?? `${place.osm_type ?? "place"}-${place.osm_id ?? name}`),
    name,
    city,
    ...(country ? { country } : {}),
    address: formatAddress(place),
    ...(websiteUrl ? { websiteUrl } : {})
  };
}

function formatAddress(place: NominatimPlace) {
  const road = place.address?.road;
  const houseNumber = place.address?.house_number;
  const city = place.address?.city || place.address?.town || place.address?.village || place.address?.municipality;

  return [road && [road, houseNumber].filter(Boolean).join(" "), city].filter(Boolean).join(", ") || place.display_name;
}

function firstDisplayNamePart(displayName: string | undefined) {
  return displayName?.split(",")[0] ?? "";
}

function buildRestaurantSearchQueries(input: RestaurantDiscoveryInput) {
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

  return uniqueStrings(queries).slice(0, MAX_DISCOVERY_QUERIES);
}

function getShortenedRestaurantNames(restaurantName: string) {
  const words = restaurantName.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return [];

  return [words.slice(0, 4).join(" "), words.slice(0, -1).join(" "), words.slice(0, -2).join(" ")];
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCityAliases(city: string) {
  const normalizedCity = normalizeSearchText(city).toLowerCase();
  const aliases: Record<string, string[]> = {
    rom: ["Roma", "Rome"],
    rome: ["Roma", "Rom"],
    "sao paulo": ["S\u00e3o Paulo"]
  };

  return aliases[normalizedCity] ?? [];
}

function getNominatimCountryCode(country: string | undefined) {
  const code = country?.trim().slice(0, 2).toLowerCase();
  return code && /^[a-z]{2}$/.test(code) ? code : "";
}

function normalizeOfficialUrl(value: string | undefined, baseUrl?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (isBlockedHost(url.hostname)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractStructuredMenuLinks(html: string, baseUrl: string): RestaurantSourceLink[] {
  const links: RestaurantSourceLink[] = [];
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const rawUrl = match[1];
    if (!rawUrl) continue;

    const url = normalizeOfficialUrl(rawUrl, baseUrl);
    if (!url) continue;

    links.push({ url, kind: isPdfUrl(url) ? "menu" : "other" });
  }

  return dedupeLinks(links).slice(0, MAX_LINKS_PER_PAGE);
}

async function collectSameDomainMenuLinks(initialResponse: Response, websiteUrl: string): Promise<RestaurantSourceLink[]> {
  const websiteDomain = getRegistrableDomain(websiteUrl);
  const initialUrl = initialResponse.url || websiteUrl;
  const discoveredLinks = await linksFromResponse(initialResponse, initialUrl);
  const menuLinks = discoveredLinks.filter((link) => link.kind === "menu" && getRegistrableDomain(link.url) === websiteDomain);
  const crawlQueue = discoveredLinks
    .filter((link) => link.kind === "other" && getRegistrableDomain(link.url) === websiteDomain)
    .map((link) => link.url);
  const visited = new Set<string>([initialUrl]);

  for (const pageUrl of uniqueStrings(crawlQueue).slice(0, MAX_CRAWL_PAGES)) {
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    try {
      const response = await fetch(pageUrl, { headers: PAGE_FETCH_HEADERS });
      if (!response.ok) continue;

      const links = await linksFromResponse(response, pageUrl);
      menuLinks.push(...links.filter((link) => link.kind === "menu" && getRegistrableDomain(link.url) === websiteDomain));
    } catch {
      continue;
    }
  }

  return dedupeLinks(menuLinks);
}

async function linksFromResponse(response: Response, fallbackUrl: string): Promise<RestaurantSourceLink[]> {
  const contentType = response.headers.get("content-type") ?? "";
  const finalUrl = response.url || fallbackUrl;

  if (contentType.includes("application/pdf")) {
    return [{ url: finalUrl, kind: "menu" }];
  }

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    return [];
  }

  const html = await response.text();
  return extractStructuredMenuLinks(html, finalUrl);
}

function isPdfUrl(value: string) {
  return value.toLowerCase().split("?")[0]?.endsWith(".pdf") ?? false;
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

function dedupeLinks(links: RestaurantSourceLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreCandidateMatch(candidate: RestaurantCandidate, input: RestaurantDiscoveryInput) {
  const candidateName = normalizeSearchText(candidate.name).toLowerCase();
  const queryName = normalizeSearchText(input.restaurantName).toLowerCase();
  const candidateCity = normalizeSearchText(candidate.city).toLowerCase();
  const queryCity = normalizeSearchText(input.city).toLowerCase();
  let score = 0;

  if (candidateName === queryName) score += 4;
  if (candidateName.includes(queryName) || queryName.includes(candidateName)) score += 2;
  if (candidateCity === queryCity) score += 2;
  if (candidate.websiteUrl) score += 1;

  return score;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRegistrableDomain(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;

    const lastTwo = parts.slice(-2).join(".");
    if (SECOND_LEVEL_DOMAIN_SUFFIXES.has(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join(".");
    }

    return lastTwo;
  } catch {
    return "";
  }
}

function isBlockedHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return BLOCKED_HOST_PARTS.some((blockedPart) => normalized.includes(blockedPart));
}
