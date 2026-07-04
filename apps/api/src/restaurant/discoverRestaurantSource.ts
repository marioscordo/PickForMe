import OpenAI from "openai";
import { z } from "zod";
import { loadMenuTextFromUrl } from "../menu/loadMenuTextFromUrl";
import { parseMenu } from "../menu/parseMenu";

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
const MAX_ANALYZABILITY_CANDIDATES_PER_PAGE = 8;
const MIN_ANALYZABLE_MENU_TEXT_LENGTH = 120;
const LIKELY_MENU_PATHS = [
  "/menu/",
  "/speisekarte/",
  "/menue/",
  "/carta/",
  "/carte/",
  "/food-menu/",
  "/dining/"
];
const MENU_SOURCE_PATH_PARTS = [
  "menu",
  "menue",
  "speisekarte",
  "karte",
  "carta",
  "carte",
  "food",
  "dining",
  "gourmetkarte"
];
const MENU_TEXT_SIGNALS = [
  "speisekarte",
  "menu",
  "carta",
  "carte",
  "antipasti",
  "primi",
  "secondi",
  "dolci",
  "vorspeisen",
  "hauptgerichte",
  "starter",
  "starters",
  "main course",
  "mains",
  "dessert",
  "drinks",
  "beverages",
  "wein",
  "wine",
  "pizza",
  "pasta",
  "salad",
  "salate",
  "fish",
  "fisch",
  "meat",
  "fleisch",
  "vegetarian"
];
const LIKELY_OFFICIAL_DOMAIN_TLDS = ["com", "de"];const NOMINATIM_QUERY_DELAY_MS = 1100;
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
  const firstPassCandidates = await requestDiscoveryCandidates(client, model, buildDiscoveryPrompt(input));
  const candidates: RestaurantDiscoveryCandidate[] = [];
  const seen = new Set<string>();

  for (const rawCandidate of firstPassCandidates.slice(0, MAX_CANDIDATES)) {
    await addVerifiedCandidate(rawCandidate, candidates, seen);
  }

  if (!hasAnalyzableMenuCandidate(candidates)) {
    const recoveryCandidates = await requestDiscoveryCandidates(
      client,
      model,
      buildMenuRecoveryPrompt(input, candidates)
    );

    for (const rawCandidate of recoveryCandidates.slice(0, MAX_CANDIDATES)) {
      await addVerifiedCandidate(rawCandidate, candidates, seen);
    }
  }

  if (!hasAnalyzableMenuCandidate(candidates)) {
    for (const rawCandidate of buildLikelyOfficialWebsiteCandidates(input)) {
      await addVerifiedMenuCandidate(rawCandidate, candidates, seen);
      if (hasAnalyzableMenuCandidate(candidates)) break;
    }
  }

  if (candidates.length < MAX_CANDIDATES) {
    for (const rawCandidate of await searchNominatimCandidates(input)) {
      await addVerifiedCandidate(rawCandidate, candidates, seen);
      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }

  return { candidates: orderCandidatesForDisplay(candidates).slice(0, MAX_CANDIDATES) };
}

async function requestDiscoveryCandidates(client: OpenAI, model: string, prompt: string) {
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
            text: prompt
          }
        ]
      }
    ]
  });

  return DiscoveryResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? ""))).candidates;
}

function hasAnalyzableMenuCandidate(candidates: RestaurantDiscoveryCandidate[]) {
  return candidates.some((candidate) => Boolean(candidate.menuUrl));
}

function orderCandidatesForDisplay(candidates: RestaurantDiscoveryCandidate[]) {
  return [...candidates].sort((left, right) => Number(Boolean(right.menuUrl)) - Number(Boolean(left.menuUrl)));
}

async function addVerifiedCandidate(
  rawCandidate: RawDiscoveryCandidate,
  candidates: RestaurantDiscoveryCandidate[],
  seen: Set<string>
) {
  const candidate = await verifyCandidate(rawCandidate);
  if (!candidate) return;

  addCandidate(candidate, candidates, seen);
}

async function addVerifiedMenuCandidate(
  rawCandidate: RawDiscoveryCandidate,
  candidates: RestaurantDiscoveryCandidate[],
  seen: Set<string>
) {
  const candidate = await verifyCandidate(rawCandidate);
  if (!candidate?.menuUrl) return;

  addCandidate(candidate, candidates, seen);
}

function addCandidate(
  candidate: RestaurantDiscoveryCandidate,
  candidates: RestaurantDiscoveryCandidate[],
  seen: Set<string>
) {
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
    "menuUrl nur setzen, wenn eine oeffentlich erreichbare und durch GustaroAI probeweise auswertbare Speisekarten- oder PDF-URL auf derselben registrierbaren Domain wie websiteUrl gefunden wurde.",
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

function buildMenuRecoveryPrompt(
  input: DiscoverRestaurantSourcesInput,
  checkedCandidates: RestaurantDiscoveryCandidate[]
) {
  const checked = checkedCandidates.length
    ? checkedCandidates
      .map((candidate) => `- ${candidate.name}, ${candidate.city}, ${candidate.websiteUrl || "keine Website"}, menuUrl: ${candidate.menuUrl || "leer"}`)
      .join("\n")
    : "- keine verwertbaren Treffer";

  return [
    "Du bist GustaroAI Restaurant-Discovery Recovery.",
    "Die erste Suche hat keinen analysierbaren Speisekartenlink geliefert.",
    "Suche erneut gezielt nach alternativen offiziellen Websites und offiziellen Speisekarten fuer exakt dieses Restaurant.",
    "Bleibe nicht beim ersten namensaehnlichen Treffer stehen, wenn dieser keine Speisekarte liefert.",
    "Unterscheide aehnliche Restaurants mit Zusatzwoertern, anderer Domain oder anderem Betreiber anhand von Adresse, Ort, Seitentitel, Impressum und Speisekarte.",
    "Bevorzuge Quellen, deren Domain, Seitentitel oder Speisekarte den gesuchten Restaurantnamen und den Ort bestaetigen.",
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
    `Stadt/Ort: ${input.city}`,
    "",
    "Bereits gepruefte Treffer ohne analysierbaren Speisekartenlink:",
    checked
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
  const analyzableRawMenuUrl = verifiedRawMenuUrl
    ? await verifyAnalyzableMenuUrl(verifiedRawMenuUrl, websiteDomain)
    : "";
  const crawledMenuUrl = analyzableRawMenuUrl || await findSameDomainAnalyzableMenuUrl(reachableWebsiteUrl);
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

function buildLikelyOfficialWebsiteCandidates(input: DiscoverRestaurantSourcesInput): RawDiscoveryCandidate[] {
  const slug = slugifyDomainPart(input.restaurantName);
  if (!slug) return [];

  const domainPrefixes = uniqueStrings([
    `restaurant-${slug}`,
    slug,
    `${slug}-restaurant`
  ]);

  return domainPrefixes.flatMap((domainPrefix) => LIKELY_OFFICIAL_DOMAIN_TLDS.flatMap((tld) => [
    `https://www.${domainPrefix}.${tld}/`,
    `https://${domainPrefix}.${tld}/`
  ])).map((websiteUrl) => ({
    name: input.restaurantName,
    city: input.city,
    address: "",
    websiteUrl,
    menuUrl: "",
    evidence: "likely-official-domain"
  }));
}

function slugifyDomainPart(value: string) {
  return normalizeSearchText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

async function verifyAnalyzableMenuUrl(value: string, expectedDomain: string) {
  const reachableUrl = await verifyReachableUrl(value);
  if (!reachableUrl) return "";
  if (getRegistrableDomain(reachableUrl) !== expectedDomain) return "";

  try {
    const menuText = await loadMenuTextFromUrl(reachableUrl);
    return isAnalyzableMenuText(menuText) ? reachableUrl : "";
  } catch {
    return "";
  }
}

function isAnalyzableMenuText(menuText: string) {
  const trimmed = menuText.trim();
  if (trimmed.length < MIN_ANALYZABLE_MENU_TEXT_LENGTH) return false;

  if (parseMenu(menuText).length >= 2) return true;

  const normalized = normalizeMenuProbeText(menuText);
  const signalHits = countIncludedTerms(normalized, MENU_TEXT_SIGNALS);
  const priceHits = (menuText.match(/(?:€|\bEUR\b|\bUSD\b|\bCHF\b|\$|£|\b\d{1,3}[,.]\d{2}\b)/gi) ?? []).length;

  if (priceHits >= 2 && signalHits >= 1) return true;
  return signalHits >= 3 && normalized.length >= 500;
}

function countIncludedTerms(value: string, terms: string[]) {
  return terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0);
}

function normalizeMenuProbeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

async function findSameDomainAnalyzableMenuUrl(websiteUrl: string) {
  const websiteDomain = getRegistrableDomain(websiteUrl);
  const visited = new Set<string>();
  const queue = uniqueStrings([websiteUrl, ...buildLikelyMenuUrls(websiteUrl)]);

  for (const pageUrl of queue) {
    if (visited.size >= MAX_CRAWL_PAGES) break;
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const links = await loadSameDomainLinks(pageUrl, websiteDomain);
    const candidateLinks = orderMenuCandidateLinks(links.filter(looksLikeMenuSourceUrl))
      .slice(0, MAX_ANALYZABILITY_CANDIDATES_PER_PAGE);

    for (const candidateUrl of candidateLinks) {
      const menuUrl = await verifyAnalyzableMenuUrl(candidateUrl, websiteDomain);
      if (menuUrl) return menuUrl;
    }

    for (const link of links) {
      if (queue.length >= MAX_CRAWL_PAGES) break;
      if (!visited.has(link) && !isPdfUrl(link)) queue.push(link);
    }
  }

  return "";
}

function buildLikelyMenuUrls(websiteUrl: string) {
  try {
    const origin = new URL(websiteUrl).origin;
    return LIKELY_MENU_PATHS.map((pathname) => new URL(pathname, origin).toString());
  } catch {
    return [];
  }
}

function orderMenuCandidateLinks(links: string[]) {
  return uniqueStrings(links).sort((left, right) => scoreMenuSourceUrl(right) - scoreMenuSourceUrl(left));
}

function scoreMenuSourceUrl(value: string) {
  const normalized = normalizeMenuProbeText(value);
  const pathHits = countIncludedTerms(normalized, MENU_SOURCE_PATH_PARTS);
  return (isPdfUrl(value) ? 10 : 0) + pathHits;
}

function looksLikeMenuSourceUrl(value: string) {
  if (isPdfUrl(value)) return true;

  try {
    const url = new URL(value);
    const normalizedPath = normalizeMenuProbeText(`${url.pathname} ${url.search}`);
    return MENU_SOURCE_PATH_PARTS.some((part) => normalizedPath.includes(part));
  } catch {
    return false;
  }
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