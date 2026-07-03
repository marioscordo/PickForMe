export type RestaurantDiscoveryInput = {
  restaurantName: string;
  city: string;
};

export type RestaurantCandidate = {
  id: string;
  name: string;
  city: string;
  address?: string;
  websiteUrl?: string;
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

export async function generateRestaurantCandidates(
  input: RestaurantDiscoveryInput,
  provider: RestaurantDiscoveryProvider = nominatimRestaurantDiscoveryProvider
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
  provider: RestaurantDiscoveryProvider = nominatimRestaurantDiscoveryProvider
): Promise<SelectedRestaurantSource> {
  const websiteUrl = normalizeOfficialUrl(candidate.websiteUrl);

  if (!websiteUrl) {
    return { websiteUrl: "" };
  }

  const websiteDomain = getRegistrableDomain(websiteUrl);
  const links = await provider.loadCandidateLinks({ ...candidate, websiteUrl });

  for (const link of links) {
    if (link.kind !== "menu") continue;

    const menuUrl = normalizeOfficialUrl(link.url, websiteUrl);
    if (!menuUrl) continue;
    if (getRegistrableDomain(menuUrl) !== websiteDomain) continue;
    if (!(await provider.validateUrl(menuUrl))) continue;

    return { websiteUrl, menuUrl };
  }

  return { websiteUrl };
}

export const nominatimRestaurantDiscoveryProvider: RestaurantDiscoveryProvider = {
  name: "openstreetmap-nominatim",

  async searchRestaurants(input) {
    const query = encodeURIComponent(`${input.restaurantName} ${input.city}`);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${DISCOVERY_LIMIT}&addressdetails=1&extratags=1&q=${query}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return [];
    }

    const places = (await response.json()) as NominatimPlace[];

    return places.map(mapNominatimPlace).filter((candidate): candidate is RestaurantCandidate => Boolean(candidate));
  },

  async loadCandidateLinks(candidate) {
    const websiteUrl = normalizeOfficialUrl(candidate.websiteUrl);
    if (!websiteUrl) return [];

    try {
      const response = await fetch(websiteUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.2"
        }
      });

      if (!response.ok) return [];

      const contentType = response.headers.get("content-type") ?? "";
      const finalUrl = response.url || websiteUrl;

      if (contentType.includes("application/pdf")) {
        return [{ url: finalUrl, kind: "menu" }];
      }

      const html = await response.text();
      return extractStructuredMenuLinks(html, finalUrl);
    } catch {
      return [];
    }
  },

  async validateUrl(url) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch {
      try {
        const response = await fetch(url);
        return response.ok;
      } catch {
        return false;
      }
    }
  }
};

function mapNominatimPlace(place: NominatimPlace): RestaurantCandidate | null {
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

    // The decision routine only consumes structured kind values. This default
    // provider marks direct PDF targets as menu candidates without reading link text.
    links.push({ url, kind: url.toLowerCase().split("?")[0]?.endsWith(".pdf") ? "menu" : "other" });
  }

  return links;
}

function getRegistrableDomain(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

function isBlockedHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return BLOCKED_HOST_PARTS.some((blockedPart) => normalized.includes(blockedPart));
}
