import OpenAI from "openai";
import { z } from "zod";

export type RestaurantDiscoveryCandidate = {
  id: string;
  name: string;
  city: string;
  address?: string;
  websiteUrl?: string;
  menuUrl?: string;
};

export type RestaurantDiscoveryResult = {
  candidates: RestaurantDiscoveryCandidate[];
};

type DiscoverRestaurantSourcesInput = {
  restaurantName: string;
  city: string;
};

type RawDiscoveryCandidate = z.infer<typeof RawDiscoveryCandidateSchema>;

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

const RawDiscoveryCandidateSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  address: z.string().optional().default(""),
  websiteUrl: z.string().optional().default(""),
  menuUrl: z.string().optional().default(""),
  evidence: z.string().optional().default("")
});

const DiscoveryResponseSchema = z.object({
  candidates: z.array(RawDiscoveryCandidateSchema).max(5)
});

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

const REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.2",
  "User-Agent": "GustaroAI/1.0 restaurant-discovery (kontakt@gustaroai.com)"
};
const MAX_CANDIDATES = 5;
const MAX_LINKS_PER_PAGE = 60;
const MAX_CRAWL_PAGES = 12;
const NOMINATIM_QUERY_DELAY_MS = 1100;
const SECOND_LEVEL_DOMAIN_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "com.br",
  "com.ar",
  "com.au",
  "co.jp",
  "com.mx"
]);

export async function discoverRestaurantSources(input: DiscoverRestaurantSourcesInput): Promise<RestaurantDiscoveryResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_DISCOVERY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await client.responses.create({
    model,
    tools: [
      {
        type: "web_search_preview",
        search_context_size: "medium"
      }
    ],
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildDiscoveryPrompt(input)
          }
        ]
      }
    ]
  });

  const parsed = DiscoveryResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "")));
  const candidates: RestaurantDiscoveryCandidate[] = [];
  const seen = new Set<string>();

  for (const rawCandidate of parsed.candidates.slice(0, MAX_CANDIDATES)) {
    await addVerifiedCandidate(rawCandidate, candidates, seen);
  }

  if (candidates.length < MAX_CANDIDATES) {
    for (const rawCandidate of await searchNominatimCandidates(input)) {
      await addVerifiedCandidate(rawCandidate, candidates, seen);
      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }

  return { candidates };
}

async function addVerifiedCandidate(
  rawCandidate: RawDiscoveryCandidate,
  candidates: RestaurantDiscoveryCandidate[],
  seen: Set<string>
) {
  const candidate = await verifyCandidate(rawCandidate);
  if (!candidate) return;

  const key = [candidate.name, candidate.city, candidate.address, candidate.websiteUrl].join("|").toLowerCase();
  if (seen.has(key)) return;

  seen.add(key);
  candidates.push(candidate);
}

function buildDiscoveryPrompt(input: DiscoverRestaurantSourcesInput) {
  return [
    "Du bist GustaroAI Restaurant-Discovery.",
    "Suche belastbare Quellen fuer ein Restaurant und gib ausschliesslich JSON zurueck.",
    "Wichtig: Es geht nur um Quellenbeschaffung, nicht um Speiseempfehlungen.",
    "Erfinde niemals URLs, Namen, Orte oder Speisekartenlinks.",
    "Akzeptiere als websiteUrl nur eine offizielle Restaurant-Website oder eine offizielle Betreiber-/Restaurantgruppen-Seite fuer genau dieses Restaurant.",
    "Keine Social-Media-, Bewertungs-, Karten-, Reservierungs-, Marketplace- oder Lieferdienstseiten als websiteUrl.",
    "menuUrl nur setzen, wenn eine oeffentlich erreichbare Speisekarten- oder PDF-URL auf derselben registrierbaren Domain wie websiteUrl gefunden wurde.",
    "Wenn keine sichere Speisekarten-URL gefunden wird, menuUrl leer lassen.",
    "Wenn keine offizielle Website gefunden wird, diesen Kandidaten nicht ausgeben.",
    "Gib hoechstens 5 Kandidaten zurueck, beste zuerst.",
    "Antwort ausschliesslich als valides JSON ohne Markdown.",
    "Schema:",
    "{\"candidates\":[{\"name\":\"\",\"city\":\"\",\"address\":\"\",\"websiteUrl\":\"\",\"menuUrl\":\"\",\"evidence\":\"\"}]}",
    "",
    `Restaurantname: ${input.restaurantName}`,
    `Stadt/Ort: ${input.city}`
  ].join("\n");
}

async function verifyCandidate(rawCandidate: RawDiscoveryCandidate): Promise<RestaurantDiscoveryCandidate | null> {
  const websiteUrl = normalizeOfficialUrl(rawCandidate.websiteUrl);
  if (!websiteUrl) return null;

  const verifiedWebsiteUrl = await verifyReachableUrl(websiteUrl);
  if (!verifiedWebsiteUrl && rawCandidate.evidence !== "openstreetmap-nominatim") return null;

  const reachableWebsiteUrl = verifiedWebsiteUrl || websiteUrl;

  const websiteDomain = getRegistrableDomain(reachableWebsiteUrl);
  const rawMenuUrl = normalizeOfficialUrl(rawCandidate.menuUrl, reachableWebsiteUrl);
  const verifiedRawMenuUrl = rawMenuUrl && canAcceptRawMenuUrl(rawMenuUrl, reachableWebsiteUrl, websiteDomain)
    ? await verifyReachableUrl(rawMenuUrl)
    : "";
  const crawledMenuUrl = verifiedRawMenuUrl || await findSameDomainPdfMenuUrl(reachableWebsiteUrl);
  const menuUrl = crawledMenuUrl && getRegistrableDomain(crawledMenuUrl) === websiteDomain ? crawledMenuUrl : "";

  return {
    id: stableCandidateId(rawCandidate, reachableWebsiteUrl),
    name: rawCandidate.name.trim(),
    city: rawCandidate.city.trim(),
    ...(rawCandidate.address.trim() ? { address: rawCandidate.address.trim() } : {}),
    websiteUrl: reachableWebsiteUrl,
    ...(menuUrl ? { menuUrl } : {})
  };
}

async function searchNominatimCandidates(input: DiscoverRestaurantSourcesInput): Promise<RawDiscoveryCandidate[]> {
  const places: NominatimPlace[] = [];

  for (const [index, queryText] of buildRestaurantSearchQueries(input).entries()) {
    if (index > 0) {
      await delay(NOMINATIM_QUERY_DELAY_MS);
    }

    const query = encodeURIComponent(queryText);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${MAX_CANDIDATES}&addressdetails=1&extratags=1&q=${query}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": REQUEST_HEADERS["User-Agent"]
      }
    });

    if (!response.ok) continue;

    places.push(...((await response.json()) as NominatimPlace[]));
    if (places.length >= MAX_CANDIDATES) break;
  }

  return places.map(mapNominatimPlace).filter((candidate): candidate is RawDiscoveryCandidate => Boolean(candidate));
}

function mapNominatimPlace(place: NominatimPlace): RawDiscoveryCandidate | null {
  const name = (place.name || firstDisplayNamePart(place.display_name)).trim();
  const city = (place.address?.city || place.address?.town || place.address?.village || place.address?.municipality || "").trim();
  const websiteUrl = normalizeOfficialUrl(
    place.extratags?.website || place.extratags?.["contact:website"] || place.extratags?.official_website
  );

  if (!name || !websiteUrl) return null;

  return {
    name,
    city,
    address: formatNominatimAddress(place),
    websiteUrl,
    menuUrl: "",
    evidence: "openstreetmap-nominatim"
  };
}

function formatNominatimAddress(place: NominatimPlace) {
  const road = place.address?.road;
  const houseNumber = place.address?.house_number;
  const city = place.address?.city || place.address?.town || place.address?.village || place.address?.municipality;

  return [road && [road, houseNumber].filter(Boolean).join(" "), city].filter(Boolean).join(", ") || place.display_name || "";
}

function firstDisplayNamePart(displayName: string | undefined) {
  return displayName?.split(",")[0] ?? "";
}

function buildRestaurantSearchQueries(input: DiscoverRestaurantSourcesInput) {
  const restaurantName = input.restaurantName.trim();
  const city = input.city.trim();
  const normalizedRestaurantName = normalizeSearchText(restaurantName);
  const normalizedCity = normalizeSearchText(city);
  const shortenedNames = getShortenedRestaurantNames(restaurantName);
  const queries = [
    `${restaurantName} ${city}`,
    `Restaurant ${restaurantName} ${city}`,
    `${normalizedRestaurantName} ${city}`,
    ...shortenedNames.flatMap((name) => [`${name} ${city}`, `${normalizeSearchText(name)} ${city}`]),
    `${restaurantName} ${normalizedCity}`,
    `${normalizedRestaurantName} ${normalizedCity}`
  ];

  return uniqueStrings(queries).slice(0, MAX_CANDIDATES);
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

function canAcceptRawMenuUrl(menuUrl: string, websiteUrl: string, websiteDomain: string) {
  if (getRegistrableDomain(menuUrl) !== websiteDomain) return false;
  if (isPdfUrl(menuUrl)) return true;
  if (sameUrlWithoutTrailingSlash(menuUrl, websiteUrl)) return false;

  const pathname = new URL(menuUrl).pathname.toLowerCase();
  const blockedPathParts = ["reservation", "reservations", "booking", "book", "contact", "kontakt", "impressum", "privacy"];
  return !blockedPathParts.some((part) => pathname.includes(part));
}

function sameUrlWithoutTrailingSlash(left: string, right: string) {
  return left.replace(/\/$/, "") === right.replace(/\/$/, "");
}

async function verifyReachableUrl(value: string) {
  const normalized = normalizeOfficialUrl(value);
  if (!normalized) return "";

  try {
    const headResponse = await fetch(normalized, { method: "HEAD", headers: REQUEST_HEADERS, redirect: "follow" });
    if (headResponse.ok) {
      return normalizeOfficialUrl(headResponse.url || normalized);
    }
  } catch {
    // Some restaurant hosts reject HEAD. Fall through to GET.
  }

  try {
    const getResponse = await fetch(normalized, { headers: REQUEST_HEADERS, redirect: "follow" });
    if (!getResponse.ok) return "";
    return normalizeOfficialUrl(getResponse.url || normalized);
  } catch {
    return "";
  }
}

async function findSameDomainPdfMenuUrl(websiteUrl: string) {
  const websiteDomain = getRegistrableDomain(websiteUrl);
  const visited = new Set<string>();
  const queue = [websiteUrl];

  for (const pageUrl of queue) {
    if (visited.size >= MAX_CRAWL_PAGES) break;
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const links = await loadSameDomainLinks(pageUrl, websiteDomain);
    const pdfUrl = links.find((link) => isPdfUrl(link));
    if (pdfUrl && await verifyReachableUrl(pdfUrl)) return pdfUrl;

    for (const link of links) {
      if (queue.length >= MAX_CRAWL_PAGES) break;
      if (!visited.has(link) && !isPdfUrl(link)) queue.push(link);
    }
  }

  return "";
}

async function loadSameDomainLinks(pageUrl: string, websiteDomain: string) {
  try {
    const response = await fetch(pageUrl, { headers: REQUEST_HEADERS, redirect: "follow" });
    if (!response.ok) return [];

    const contentType = response.headers.get("content-type") ?? "";
    const finalUrl = response.url || pageUrl;

    if (contentType.includes("application/pdf")) {
      return [finalUrl];
    }

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return [];
    }

    return extractLinks(await response.text(), finalUrl)
      .filter((link) => getRegistrableDomain(link) === websiteDomain)
      .slice(0, MAX_LINKS_PER_PAGE);
  } catch {
    return [];
  }
}

function extractLinks(html: string, baseUrl: string) {
  const links: string[] = [];
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const url = normalizeOfficialUrl(match[1], baseUrl);
    if (url) links.push(url);
  }

  return uniqueStrings(links);
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableCandidateId(candidate: RawDiscoveryCandidate, websiteUrl: string) {
  return [candidate.name, candidate.city, candidate.address, websiteUrl]
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}