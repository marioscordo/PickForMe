import OpenAI from "openai";
import { z } from "zod";
import { loadMenuTextFromUrl } from "../menu/loadMenuTextFromUrl";
import { parseMenu } from "../menu/parseMenu";
import {
  getRestaurantDiscoveryCountryCode,
  getRestaurantDiscoveryCountryNames,
  getRestaurantDiscoveryCountryTlds,
  getRestaurantDiscoveryNominatimCountryCode
} from "./restaurantDiscoveryCountries";

export type RestaurantDiscoveryCandidate = {
  id: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  websiteUrl?: string;
  menuUrl?: string;
  externalMenuCandidate?: ExternalMenuCandidate;
};

export type ExternalMenuCandidate = {
  url: string;
  providerDomain: string;
};

export type RestaurantDiscoveryResult = {
  candidates: RestaurantDiscoveryCandidate[];
};

type DiscoverRestaurantSourcesInput = {
  restaurantName: string;
  city: string;
  country?: string;
};

type RawDiscoveryCandidate = z.infer<typeof RawDiscoveryCandidateSchema>;
type RawRestaurantCandidate = z.infer<typeof RawRestaurantCandidateSchema>;

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
  country: z.string().optional().default(""),
  address: z.string().optional().default(""),
  websiteUrl: z.string().optional().default(""),
  menuUrl: z.string().optional().default(""),
  evidence: z.string().optional().default("")
});

const RawRestaurantCandidateSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  country: z.string().optional().default(""),
  address: z.string().optional().default(""),
  websiteUrl: z.string().optional().default(""),
  evidence: z.string().optional().default("")
});

const RestaurantOnlyResponseSchema = z.object({
  candidates: z.array(RawRestaurantCandidateSchema).max(5)
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
  "bistro",
  "brasserie",
  "bar"
]);
const MAX_CANDIDATES = 5;
const CONTACT_PAGE_FETCH_TIMEOUT_MS = 4500;
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
const LIKELY_OFFICIAL_DOMAIN_TLDS = ["com", "de"];
const NOMINATIM_QUERY_DELAY_MS = 1100;
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
const SECOND_LEVEL_DOMAIN_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "com.br",
  "com.ar",
  "com.au",
  "co.jp",
  "com.mx"
]);
const TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS = [
  "menualacarte.cloud"
];
const TRUSTED_EXTERNAL_PROVIDER_LANGUAGE_CODES = ["en", "it", "de", "fr", "es", "nl"];
const FULL_MENU_PROVIDER_TERMS = [
  "listfull",
  "full list",
  "lista completa",
  "complete menu",
  "menu completo",
  "menu a la carte",
  "a la carte"
];
const PARTIAL_MENU_PROVIDER_TERMS = [
  "menuai",
  "tasting",
  "degustazione",
  "degustation",
  "cocktail",
  "wine",
  "vini",
  "bar"
];
const ADDRESS_ANCHOR_TERMS = [
  "via",
  "viale",
  "piazza",
  "piazzale",
  "corso",
  "largo",
  "strada",
  "street",
  "road",
  "avenue",
  "place",
  "plaza",
  "rue",
  "allee",
  "chaussee"
];

export async function discoverRestaurantCandidatesOnly(input: DiscoverRestaurantSourcesInput): Promise<RestaurantDiscoveryResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_DISCOVERY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const rawCandidates = await requestRestaurantOnlyCandidates(client, model, buildRestaurantOnlyPrompt(input));
  const candidates: RestaurantDiscoveryCandidate[] = [];
  const seen = new Set<string>();

  for (const rawCandidate of rawCandidates.slice(0, MAX_CANDIDATES)) {
    await addVerifiedRestaurantCandidate(rawCandidate, candidates, seen);
  }

  if (candidates.length < MAX_CANDIDATES) {
    for (const rawCandidate of await searchNominatimCandidates(input)) {
      await addVerifiedRestaurantCandidate(rawCandidate, candidates, seen);
      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }

  return { candidates: candidates.slice(0, MAX_CANDIDATES) };
}

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

  await addTrustedExternalProviderCandidates(input, candidates, seen);

  if (candidates.length < MAX_CANDIDATES) {
    for (const rawCandidate of await searchNominatimCandidates(input)) {
      await addVerifiedCandidate(rawCandidate, candidates, seen);
      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }

  return { candidates: orderCandidatesForDisplay(candidates).slice(0, MAX_CANDIDATES) };
}

async function requestRestaurantOnlyCandidates(client: OpenAI, model: string, prompt: string) {
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

  return RestaurantOnlyResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? ""))).candidates;
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

async function addVerifiedRestaurantCandidate(
  rawCandidate: RawRestaurantCandidate,
  candidates: RestaurantDiscoveryCandidate[],
  seen: Set<string>
) {
  const candidate = await verifyRestaurantCandidate(rawCandidate);
  if (!candidate) return;

  addCandidate(candidate, candidates, seen);
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
  const websiteKey = candidate.websiteUrl ? `website:${candidate.websiteUrl.toLowerCase().replace(/\/+$/, "")}` : "";
  if (websiteKey && seen.has(websiteKey)) return;

  const key = [candidate.name, candidate.city, candidate.address, candidate.websiteUrl].join("|").toLowerCase();
  if (seen.has(key)) return;

  seen.add(key);
  if (websiteKey) seen.add(websiteKey);
  candidates.push(candidate);
}

async function addTrustedExternalProviderCandidates(
  input: DiscoverRestaurantSourcesInput,
  candidates: RestaurantDiscoveryCandidate[],
  seen: Set<string>
) {
  if (candidates.length >= MAX_CANDIDATES) return;

  for (const entryUrl of buildTrustedExternalProviderEntryUrls(input)) {
    const candidate = await verifyTrustedExternalProviderRestaurantCandidate(input, entryUrl);
    if (!candidate) continue;

    addCandidate(candidate, candidates, seen);
    return;
  }
}

async function verifyTrustedExternalProviderRestaurantCandidate(
  input: DiscoverRestaurantSourcesInput,
  entryUrl: string
): Promise<RestaurantDiscoveryCandidate | null> {
  const providerDomain = getTrustedExternalMenuProviderDomain(entryUrl);
  if (!providerDomain) return null;

  const source = await loadExternalProviderPage(entryUrl);
  if (!source) return null;

  const sourceProviderDomain = getTrustedExternalMenuProviderDomain(source.finalUrl);
  if (sourceProviderDomain !== providerDomain) return null;

  const sourceText = htmlToPlainText(source.html);
  if (!sourceTextMatchesRestaurant(input.restaurantName, sourceText)) return null;
  if (!sourceTextMatchesCity(input.city, sourceText)) return null;

  const address = extractProviderAddress(sourceText, input.city);
  if (!address) return null;

  const linkedMenuUrl = await findBestExternalProviderMenuUrl(source.html, source.finalUrl, providerDomain, input, address);
  if (!linkedMenuUrl) return null;

  return {
    id: stableExternalProviderCandidateId(input.restaurantName, input.city, address, linkedMenuUrl),
    name: input.restaurantName.trim(),
    city: input.city.trim(),
    ...(getRestaurantDiscoveryCountryCode(input.country) ? { country: getRestaurantDiscoveryCountryCode(input.country) } : {}),
    address,
    websiteUrl: source.finalUrl,
    externalMenuCandidate: {
      url: linkedMenuUrl,
      providerDomain
    }
  };
}

function buildTrustedExternalProviderEntryUrls(input: DiscoverRestaurantSourcesInput) {
  const slugs = buildTrustedExternalProviderSlugs(input.restaurantName);
  const languageCodes = buildTrustedExternalProviderLanguageCodes(input.country);

  return uniqueStrings(TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS.flatMap((domain) =>
    slugs.flatMap((slug) => languageCodes.map((languageCode) => `https://www.${domain}/m/${slug}/${languageCode}`))
  ));
}

function buildTrustedExternalProviderSlugs(restaurantName: string) {
  const normalized = normalizeSearchText(restaurantName)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(" ").filter(Boolean);
  const withoutGenericWords = words.filter((word) => !GENERIC_RESTAURANT_WORDS.has(word));

  return uniqueStrings([
    words.join(""),
    withoutGenericWords.join(""),
    words.join("-"),
    withoutGenericWords.join("-")
  ].filter((value) => value.length >= 3));
}

function buildTrustedExternalProviderLanguageCodes(country: string | undefined) {
  const countryCode = getRestaurantDiscoveryCountryCode(country).toLowerCase();
  const preferred = countryCode && TRUSTED_EXTERNAL_PROVIDER_LANGUAGE_CODES.includes(countryCode)
    ? [countryCode]
    : [];

  return uniqueStrings([...preferred, "en", ...TRUSTED_EXTERNAL_PROVIDER_LANGUAGE_CODES]);
}

async function loadExternalProviderPage(url: string) {
  const normalizedUrl = normalizeOfficialUrl(url);
  if (!normalizedUrl || !getTrustedExternalMenuProviderDomain(normalizedUrl)) return null;

  try {
    const response = await fetch(normalizedUrl, { headers: REQUEST_HEADERS, redirect: "follow" });
    if (!response.ok) return null;

    const finalUrl = normalizeOfficialUrl(response.url || normalizedUrl);
    if (!finalUrl || !getTrustedExternalMenuProviderDomain(finalUrl)) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;

    return {
      finalUrl,
      html: await response.text()
    };
  } catch {
    return null;
  }
}

async function findBestExternalProviderMenuUrl(
  html: string,
  baseUrl: string,
  providerDomain: string,
  input: DiscoverRestaurantSourcesInput,
  address: string
) {
  const links = extractLabeledLinks(html, baseUrl)
    .filter((link) => getTrustedExternalMenuProviderDomain(link.url) === providerDomain)
    .filter((link) => !sameUrlWithoutTrailingSlash(link.url, baseUrl))
    .filter((link) => looksLikeExternalProviderMenuLink(link));

  for (const link of orderExternalProviderMenuLinks(links).slice(0, MAX_ANALYZABILITY_CANDIDATES_PER_PAGE)) {
    const source = await loadExternalProviderPage(link.url);
    if (!source) continue;

    const sourceText = htmlToPlainText(source.html);
    if (!sourceTextMatchesRestaurant(input.restaurantName, sourceText)) continue;
    if (!sourceTextMatchesCity(input.city, sourceText)) continue;
    if (!sourceTextIncludesAddress(sourceText, address)) continue;

    return source.finalUrl;
  }

  return "";
}

function extractLabeledLinks(html: string, baseUrl: string) {
  const links: Array<{ url: string; label: string }> = [];
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const url = normalizeOfficialUrl(match[1] ?? "", baseUrl);
    if (!url) continue;

    links.push({
      url,
      label: htmlToPlainText(match[2] ?? "")
    });
  }

  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLikeExternalProviderMenuLink(link: { url: string; label: string }) {
  const normalized = normalizeMenuProbeText(`${link.url} ${link.label}`);

  return FULL_MENU_PROVIDER_TERMS.some((term) => normalized.includes(term)) ||
    normalized.includes("menu") ||
    normalized.includes("carta") ||
    normalized.includes("carte");
}

function orderExternalProviderMenuLinks(links: Array<{ url: string; label: string }>) {
  return [...links].sort((left, right) => scoreExternalProviderMenuLink(right) - scoreExternalProviderMenuLink(left));
}

function scoreExternalProviderMenuLink(link: { url: string; label: string }) {
  const normalized = normalizeMenuProbeText(`${link.url} ${link.label}`);
  let score = 0;

  if (FULL_MENU_PROVIDER_TERMS.some((term) => normalized.includes(term))) score += 100;
  if (normalized.includes("listfull")) score += 100;
  if (normalized.includes("menu")) score += 8;
  if (PARTIAL_MENU_PROVIDER_TERMS.some((term) => normalized.includes(term))) score -= 80;

  return score;
}

function sourceTextMatchesRestaurant(restaurantName: string, sourceText: string) {
  const source = normalizeComparableText(sourceText);
  const tokens = restaurantNameTokens(restaurantName);

  return tokens.length > 0 && tokens.every((token) => sourceContainsNameToken(token, source));
}

// Nutzereingaben zum Restaurantnamen koennen von der auf der Website
// tatsaechlich verwendeten Schreibweise leicht abweichen (z.B. "Winkelmoos"
// statt "Winklmoos" - Fallanalyse "sonnenalm.de", Juli 2026). Ein reiner
// Substring-Abgleich verwirft dann einen inhaltlich korrekten Treffer
// komplett. Fuer laengere Woerter (ab 6 Zeichen) wird deshalb zusaetzlich
// jede Variante mit genau einem entfernten Zeichen als Teilstring geprueft -
// das deckt den haeufigsten Fall (ein ueberzaehliger Buchstabe in der
// Eingabe) ab, ohne die Pruefung insgesamt zu lockern: es muss weiterhin
// jedes Namens-Token irgendeine Entsprechung im Seitentext haben.
function sourceContainsNameToken(token: string, source: string): boolean {
  if (source.includes(token)) return true;
  if (token.length < 6) return false;

  for (let i = 0; i < token.length; i += 1) {
    const variant = token.slice(0, i) + token.slice(i + 1);
    if (source.includes(variant)) return true;
  }

  return false;
}

function sourceTextMatchesCity(city: string, sourceText: string) {
  const cityToken = normalizeComparableText(city);
  if (!cityToken) return true;

  return normalizeComparableText(sourceText).includes(cityToken);
}

// verifyTrustedExternalProviderRestaurantCandidate prueft unten schon per
// sourceTextMatchesRestaurant/-City, ob eine Seite wirklich zum gesuchten
// Restaurant passt. verifyRestaurantCandidate/verifyCandidate (Hauptpfad,
// von der KI-Websuche gespeiste "offizielle Website") pruefte das bisher
// NICHT - nur Erreichbarkeit (verifyReachableUrl), nicht Inhalt. Codereview
// Juli 2026: In einer Stichprobe hat das zu falschen Treffern gefuehrt (die
// KI lieferte eine erreichbare, aber voellig unpassende Website, z.B. ein
// anderes Restaurant in derselben Stadt). Mit dieser Pruefung - via
// Testskript verifiziert, 5 von 6 korrekte Treffer inkl. korrekter
// Filial-Unterscheidung bei einer Kette - wird das abgefangen.
async function contentMatchesRestaurant(url: string, name: string, city: string): Promise<boolean> {
  try {
    const response = await fetch(url, { headers: REQUEST_HEADERS, redirect: "follow" });
    if (!response.ok) return false;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      // z.B. direkte PDF-Antwort - Textabgleich hier nicht sinnvoll, nicht blockieren.
      return true;
    }

    const html = await response.text();
    const text = htmlToPlainText(html);

    if (!sourceTextMatchesRestaurant(name, text)) return false;
    if (sourceTextMatchesCity(city, text)) return true;

    // Manche Websites nennen den Ort nicht auf der Startseite, sondern nur
    // auf einer Kontakt-/Impressum-Unterseite (Fallanalyse "sonnenalm.de",
    // Juli 2026: "Reit im Winkl" stand nur unter /kontakt/, nicht auf der
    // Startseite). Bevor der Kandidat verworfen wird, deshalb noch eine
    // kleine, auf dieselbe Domain begrenzte Auswahl ueblicher
    // Kontaktseiten pruefen.
    return await contactPageMatchesCity(response.url || url, city);
  } catch {
    return false;
  }
}

const CONTACT_PAGE_SLUGS = ["kontakt", "contact", "impressum"];

async function contactPageMatchesCity(baseUrl: string, city: string): Promise<boolean> {
  const expectedDomain = getRegistrableDomain(baseUrl);
  if (!expectedDomain) return false;

  const baseForRelativeLinks = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  for (const slug of CONTACT_PAGE_SLUGS) {
    const candidateUrl = normalizeOfficialUrl(`${slug}/`, baseForRelativeLinks);
    if (!candidateUrl || getRegistrableDomain(candidateUrl) !== expectedDomain) continue;

    // Ohne Timeout kann eine einzelne langsame/haengende Kontaktseite die
    // gesamte Kandidaten-Pruefung unnoetig verzoegern (bis zu drei
    // zusaetzliche Fetches pro Kandidat) - bei einem Vercel-Funktionslimit
    // kann das im Zweifel eine sonst funktionierende Suche zum Scheitern
    // bringen. Ein Praxis-Test (28.07.2026) zeigte genau dieses Muster: ein
    // zuvor funktionierendes Restaurant scheiterte einmalig und lief beim
    // naechsten Versuch wieder durch - typisch fuer eine haengende Anfrage,
    // nicht fuer einen Logikfehler.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONTACT_PAGE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(candidateUrl, {
        headers: REQUEST_HEADERS,
        redirect: "follow",
        signal: controller.signal
      });
      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) continue;

      const text = htmlToPlainText(await response.text());
      if (sourceTextMatchesCity(city, text)) return true;
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return false;
}

function extractProviderAddress(sourceText: string, city: string) {
  const normalizedSource = sourceText.replace(/\s+/g, " ").trim();
  const cityToken = normalizeComparableText(city);
  const addressPattern = new RegExp(`\\b(?:${ADDRESS_ANCHOR_TERMS.join("|")})\\b.{0,120}`, "i");
  const addressMatch = normalizedSource.match(addressPattern)?.[0]?.trim() ?? "";

  if (addressMatch && (!cityToken || normalizeComparableText(addressMatch).includes(cityToken))) {
    return cleanupAddressSnippet(addressMatch);
  }

  if (!cityToken) return "";

  const normalizedComparable = normalizeComparableText(normalizedSource);
  const cityIndex = normalizedComparable.indexOf(cityToken);
  if (cityIndex < 0) return "";

  const originalStart = Math.max(0, cityIndex - 90);
  const snippet = normalizedSource.slice(originalStart, Math.min(normalizedSource.length, originalStart + 150)).trim();
  const anchorIndex = findFirstAddressAnchorIndex(snippet);
  const anchoredSnippet = anchorIndex >= 0 ? snippet.slice(anchorIndex) : snippet;

  return cleanupAddressSnippet(anchoredSnippet);
}

function cleanupAddressSnippet(value: string) {
  const trimmedValue = value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  const stopIndex = findFirstAddressStopIndex(trimmedValue);
  const boundedValue = stopIndex >= 0 ? trimmedValue.slice(0, stopIndex) : trimmedValue;

  return boundedValue.trim().slice(0, 160);
}

function findFirstAddressStopIndex(value: string) {
  const indexes = [
    value.search(/\b(?:tel|phone|telefono|email|mail|menu|men[uù]|degustazione|tasting)\b/i),
    value.search(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  ].filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function findFirstAddressAnchorIndex(value: string) {
  const normalized = normalizeComparableText(value);
  const indexes = ADDRESS_ANCHOR_TERMS
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function sourceTextIncludesAddress(sourceText: string, address: string) {
  const source = normalizeComparableText(sourceText);
  const addressTokens = normalizeComparableText(address)
    .split(" ")
    .filter((token) => token.length >= 2 && !ADDRESS_ANCHOR_TERMS.includes(token));
  const meaningfulTokens = addressTokens.filter((token) => !/^\d{4,5}$/.test(token));

  if (meaningfulTokens.length === 0) return false;

  const hits = meaningfulTokens.filter((token) => source.includes(token)).length;
  return hits >= Math.min(3, meaningfulTokens.length);
}

function restaurantNameTokens(value: string) {
  return normalizeComparableText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_RESTAURANT_WORDS.has(token));
}

function htmlToPlainText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(value: string | undefined) {
  return normalizeSearchText(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTrustedExternalMenuProviderDomain(value: string | undefined) {
  const domain = value ? getRegistrableDomain(value) : "";
  return TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS.includes(domain) ? domain : "";
}

function stableExternalProviderCandidateId(restaurantName: string, city: string, address: string, menuUrl: string) {
  return [restaurantName, city, address, menuUrl]
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
function buildRestaurantOnlyPrompt(input: DiscoverRestaurantSourcesInput) {
  return [
    "Du bist GustaroAI Restaurant-Discovery.",
    "Suche das offiziell passende Restaurant und gib ausschliesslich JSON zurueck.",
    "Wichtig: Es geht nur um die Restaurant- und Website-Suche, nicht um Speisekarten, Menues, PDFs oder Speiseempfehlungen.",
    "Erfinde niemals URLs, Namen, Orte oder Adressen.",
    "Akzeptiere als websiteUrl nur eine offizielle Restaurant-Website oder eine offizielle Betreiber-/Restaurantgruppen-Seite fuer genau dieses Restaurant.",
    "Keine Social-Media-, Bewertungs-, Karten-, Reservierungs-, Marketplace- oder Lieferdienstseiten als websiteUrl.",
    "Suche keine Speisekarte und gib keine Speisekartenlinks aus.",
    "Wenn keine offizielle Website gefunden wird, diesen Kandidaten nicht ausgeben.",
    input.country
      ? "Wenn ein Land angegeben ist, suche ausschliesslich in diesem Land und gib keine gleichnamigen Restaurants aus anderen Laendern aus."
      : "",
    "Gib hoechstens 5 Restaurantkandidaten zurueck, beste zuerst.",
    "Antwort ausschliesslich als valides JSON ohne Markdown.",
    "Schema:",
    "{\"candidates\":[{\"name\":\"\",\"city\":\"\",\"country\":\"\",\"address\":\"\",\"websiteUrl\":\"\",\"evidence\":\"\"}]}",
    "",
    `Restaurantname: ${input.restaurantName}`,
    `Stadt/Ort: ${input.city}`,
    `Land: ${getRestaurantDiscoveryCountryNames(input.country)[0] ?? input.country ?? ""}`
  ].filter(Boolean).join("\n");
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
    input.country
      ? "Wenn ein Land angegeben ist, suche ausschliesslich in diesem Land und gib keine gleichnamigen Restaurants aus anderen Laendern aus."
      : "",
    "Gib hoechstens 5 Kandidaten zurueck, beste zuerst.",
    "Antwort ausschliesslich als valides JSON ohne Markdown.",
    "Schema:",
    "{\"candidates\":[{\"name\":\"\",\"city\":\"\",\"address\":\"\",\"websiteUrl\":\"\",\"menuUrl\":\"\",\"evidence\":\"\"}]}",
    "",
    `Restaurantname: ${input.restaurantName}`,
    `Stadt/Ort: ${input.city}`,
    `Land: ${getRestaurantDiscoveryCountryNames(input.country)[0] ?? input.country ?? ""}`
  ].filter(Boolean).join("\n");
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
    input.country
      ? "Wenn ein Land angegeben ist, suche ausschliesslich in diesem Land und gib keine gleichnamigen Restaurants oder Quellen aus anderen Laendern aus."
      : "",
    "Gib hoechstens 5 Kandidaten zurueck, beste zuerst.",
    "Antwort ausschliesslich als valides JSON ohne Markdown.",
    "Schema:",
    "{\"candidates\":[{\"name\":\"\",\"city\":\"\",\"address\":\"\",\"websiteUrl\":\"\",\"menuUrl\":\"\",\"evidence\":\"\"}]}",
    "",
    `Restaurantname: ${input.restaurantName}`,
    `Stadt/Ort: ${input.city}`,
    `Land: ${getRestaurantDiscoveryCountryNames(input.country)[0] ?? input.country ?? ""}`,
    "",
    "Bereits gepruefte Treffer ohne analysierbaren Speisekartenlink:",
    checked
  ].filter(Boolean).join("\n");
}

async function verifyRestaurantCandidate(rawCandidate: RawRestaurantCandidate): Promise<RestaurantDiscoveryCandidate | null> {
  const websiteUrl = normalizeOfficialUrl(rawCandidate.websiteUrl);
  if (!websiteUrl) return null;

  const verifiedWebsiteUrl = await verifyReachableUrl(websiteUrl);
  if (!verifiedWebsiteUrl && rawCandidate.evidence !== "openstreetmap-nominatim") return null;

  const reachableWebsiteUrl = verifiedWebsiteUrl || websiteUrl;

  if (!(await contentMatchesRestaurant(reachableWebsiteUrl, rawCandidate.name, rawCandidate.city))) {
    return null;
  }

  return {
    id: stableCandidateId({ ...rawCandidate, menuUrl: "" }, reachableWebsiteUrl),
    name: rawCandidate.name.trim(),
    city: rawCandidate.city.trim(),
    ...(getRestaurantDiscoveryCountryCode(rawCandidate.country) ? { country: getRestaurantDiscoveryCountryCode(rawCandidate.country) } : {}),
    ...(rawCandidate.address.trim() ? { address: rawCandidate.address.trim() } : {}),
    websiteUrl: reachableWebsiteUrl
  };
}

async function verifyCandidate(rawCandidate: RawDiscoveryCandidate): Promise<RestaurantDiscoveryCandidate | null> {
  const websiteUrl = normalizeOfficialUrl(rawCandidate.websiteUrl);
  if (!websiteUrl) return null;

  const verifiedWebsiteUrl = await verifyReachableUrl(websiteUrl);
  if (!verifiedWebsiteUrl && rawCandidate.evidence !== "openstreetmap-nominatim") return null;

  const reachableWebsiteUrl = verifiedWebsiteUrl || websiteUrl;

  if (!(await contentMatchesRestaurant(reachableWebsiteUrl, rawCandidate.name, rawCandidate.city))) {
    return null;
  }

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
    ...(getRestaurantDiscoveryCountryCode(rawCandidate.country) ? { country: getRestaurantDiscoveryCountryCode(rawCandidate.country) } : {}),
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
  const countryTlds = getRestaurantDiscoveryCountryTlds(input.country);
  const tlds = countryTlds.length > 0 ? countryTlds : LIKELY_OFFICIAL_DOMAIN_TLDS;

  return tlds.flatMap((tld) => domainPrefixes.flatMap((domainPrefix) => [
    `https://www.${domainPrefix}.${tld}/`,
    `https://${domainPrefix}.${tld}/`
  ])).map((websiteUrl) => ({
    name: input.restaurantName,
    city: input.city,
    country: getRestaurantDiscoveryCountryCode(input.country) || input.country || "",
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
  const country = getRestaurantDiscoveryCountryCode(input.country);

  for (const [index, queryText] of buildRestaurantSearchQueries({ ...input, country }).entries()) {
    if (index > 0) {
      await delay(NOMINATIM_QUERY_DELAY_MS);
    }

    const query = encodeURIComponent(queryText);
    const countryCodes = getRestaurantDiscoveryNominatimCountryCode(country);
    const countryCodesParam = countryCodes ? `&countrycodes=${encodeURIComponent(countryCodes)}` : "";
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${MAX_CANDIDATES}&addressdetails=1&extratags=1${countryCodesParam}&q=${query}`;
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

  return places
    .filter(isRestaurantPlace)
    .map((place) => mapNominatimPlace(place, country))
    .filter((candidate): candidate is RawDiscoveryCandidate => Boolean(candidate));
}

function mapNominatimPlace(place: NominatimPlace, country: string): RawDiscoveryCandidate | null {
  const name = (place.name || firstDisplayNamePart(place.display_name)).trim();
  const city = (place.address?.city || place.address?.town || place.address?.village || place.address?.municipality || "").trim();
  const websiteUrl = normalizeOfficialUrl(
    place.extratags?.website || place.extratags?.["contact:website"] || place.extratags?.official_website
  );

  if (!name || !websiteUrl) return null;

  return {
    name,
    city,
    country,
    address: formatNominatimAddress(place),
    websiteUrl,
    menuUrl: "",
    evidence: "openstreetmap-nominatim"
  };
}

function isRestaurantPlace(place: NominatimPlace) {
  const category = normalizePlaceType(place.category ?? place.class);
  const type = normalizePlaceType(place.type);

  return category === "amenity" && RESTAURANT_PLACE_TYPES.has(type);
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

function normalizePlaceType(value: string | undefined) {
  return normalizeSearchText(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

  if (!isPdfUrl(reachableUrl)) {
    const linkedMenuUrl = await findLinkedAnalyzableMenuUrl(reachableUrl, expectedDomain);
    if (linkedMenuUrl) return linkedMenuUrl;
  }

  return verifyDirectAnalyzableMenuUrl(reachableUrl, expectedDomain);
}

async function findLinkedAnalyzableMenuUrl(pageUrl: string, expectedDomain: string) {
  const links = await loadSameDomainLinks(pageUrl, expectedDomain);
  const candidateLinks = orderMenuCandidateLinks(links.filter(looksLikeMenuSourceUrl))
    .slice(0, MAX_ANALYZABILITY_CANDIDATES_PER_PAGE);

  for (const candidateUrl of candidateLinks) {
    if (sameUrlWithoutTrailingSlash(candidateUrl, pageUrl)) continue;

    const reachableUrl = await verifyReachableUrl(candidateUrl);
    if (!reachableUrl) continue;
    if (getRegistrableDomain(reachableUrl) !== expectedDomain) continue;

    const menuUrl = await verifyDirectAnalyzableMenuUrl(reachableUrl, expectedDomain);
    if (menuUrl) return menuUrl;
  }

  return "";
}

async function verifyDirectAnalyzableMenuUrl(value: string, expectedDomain: string) {
  if (getRegistrableDomain(value) !== expectedDomain) return "";

  try {
    const menuText = await loadMenuTextFromUrl(value);
    return isAnalyzableMenuText(menuText) ? value : "";
  } catch {
    return "";
  }
}

function isAnalyzableMenuText(menuText: string) {
  const trimmed = menuText.trim();
  if (trimmed.length < MIN_ANALYZABLE_MENU_TEXT_LENGTH) return false;

  return parseMenu(menuText).length >= 2;
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
    const url = normalizeOfficialUrl(match[1] ?? "", baseUrl);
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
