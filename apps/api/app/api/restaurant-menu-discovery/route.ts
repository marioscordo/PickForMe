import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { loadMenuTextFromUrl } from "../../../src/menu/loadMenuTextFromUrl";
import { parseMenu } from "../../../src/menu/parseMenu";
import { discoverRestaurantSources, type RestaurantDiscoveryCandidate } from "../../../src/restaurant/discoverRestaurantSource";

const MENU_DISCOVERY_TIMEOUT_MS = 20000;
const PAGE_SOURCE_FETCH_TIMEOUT_MS = 4500;
const PDF_LINK_FETCH_TIMEOUT_MS = 4500;
const MIN_ANALYZABLE_MENU_ITEMS = 2;
const MIN_LIKELY_MENU_TEXT_LENGTH = 500;
const MIN_LIKELY_MENU_PRICE_COUNT = 2;
const MAX_SOURCE_LINKS_TO_CHECK = 12;
const MAX_LIKELY_ORIGINS_TO_CHECK = 14;
const SOURCE_FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
  "User-Agent": "GustaroAI/1.0 restaurant-menu-discovery (kontakt@gustaroai.com)"
};
const MENU_SOURCE_TERMS = [
  "speisekarte",
  "menu",
  "menue",
  "karte",
  "carta",
  "carte",
  "food",
  "dining",
  "gourmetkarte",
  "essen",
  "kueche",
  "cucina"
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

const RestaurantMenuDiscoveryRequestSchema = z.object({
  candidate: z.object({
    id: z.string().optional().default(""),
    name: z.string().trim().min(1).max(160),
    city: z.string().trim().max(120).optional().default(""),
    address: z.string().trim().max(240).optional().default(""),
    websiteUrl: z.string().trim().max(500).optional().default(""),
    menuUrl: z.string().trim().max(500).optional().default("")
  })
});

type RestaurantMenuDiscoveryRequest = z.infer<typeof RestaurantMenuDiscoveryRequestSchema>;

type RestaurantMenuDiscoveryResult = {
  websiteUrl: string;
  menuUrl?: string;
};

type SourceLink = {
  url: string;
  label: string;
};

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body = RestaurantMenuDiscoveryRequestSchema.parse(await request.json());
    const data = await withTimeout(
      resolveMenuForCandidate(body.candidate),
      MENU_DISCOVERY_TIMEOUT_MS,
      { websiteUrl: normalizeOfficialUrl(body.candidate.websiteUrl) }
    );

    return NextResponse.json({
      ok: true,
      data
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError(400, "RESTAURANT_MENU_DISCOVERY_INVALID_REQUEST", "Bitte ein Restaurant auswaehlen.", error.issues)
      );
    }

    return errorResponse(error);
  }
}

async function resolveMenuForCandidate(
  candidate: RestaurantMenuDiscoveryRequest["candidate"]
): Promise<RestaurantMenuDiscoveryResult> {
  const websiteUrl = normalizeOfficialUrl(candidate.websiteUrl);
  const directMenuUrl = normalizeOfficialUrl(candidate.menuUrl, websiteUrl);

  if (directMenuUrl) {
    const verifiedMenuUrl = await findAnalyzableMenuUrl([directMenuUrl]);
    if (!verifiedMenuUrl) {
      return { websiteUrl };
    }

    return {
      websiteUrl,
      menuUrl: verifiedMenuUrl
    };
  }

  const sourceMenu = await findMenuInWebsiteSource(candidate, websiteUrl);
  if (sourceMenu.menuUrl) {
    return sourceMenu;
  }

  const discovery = await discoverRestaurantSources({
    restaurantName: candidate.name,
    city: candidate.city || inferCityFromAddress(candidate.address)
  });

  const best = discovery.candidates
    .filter((discoveredCandidate) => Boolean(discoveredCandidate.menuUrl))
    .map((discoveredCandidate) => ({
      candidate: discoveredCandidate,
      score: scoreDiscoveredCandidate(discoveredCandidate, candidate)
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!best || best.score <= 0 || !best.candidate.menuUrl) {
    return { websiteUrl };
  }

  return {
    websiteUrl: best.candidate.websiteUrl ?? websiteUrl,
    menuUrl: best.candidate.menuUrl
  };
}

async function findMenuInWebsiteSource(
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  websiteUrl: string
): Promise<RestaurantMenuDiscoveryResult> {
  if (websiteUrl) {
    const menuUrl = await findMenuFromOfficialSource(candidate, websiteUrl, false);
    return {
      websiteUrl,
      ...(menuUrl ? { menuUrl } : {})
    };
  }

  for (const origin of buildLikelyOfficialOrigins(candidate.name).slice(0, MAX_LIKELY_ORIGINS_TO_CHECK)) {
    const menuUrl = await findMenuFromOfficialSource(candidate, origin, true);
    if (menuUrl) {
      return {
        websiteUrl: getOriginUrl(origin),
        menuUrl
      };
    }
  }

  return { websiteUrl: "" };
}

async function findMenuFromOfficialSource(
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  websiteUrl: string,
  requireSourceMatch: boolean
) {
  const sourceUrls = uniqueStrings([websiteUrl, getOriginUrl(websiteUrl)]).filter(Boolean);

  for (const sourceUrl of sourceUrls) {
    const source = await loadPageSource(sourceUrl);
    if (!source) continue;
    if (requireSourceMatch && !sourceMatchesRestaurant(source.html, source.finalUrl, candidate)) continue;

    const websiteDomain = getRegistrableDomain(source.finalUrl);
    const menuLinks = orderSourceMenuLinks(
      extractSourceLinks(source.html, source.finalUrl)
        .filter((link) => getRegistrableDomain(link.url) === websiteDomain)
        .filter(looksLikeMenuSourceLink)
    );
    const menuUrl = await findAnalyzableMenuUrl(menuLinks.map((link) => link.url));
    if (menuUrl) return menuUrl;

    if (looksLikeMenuPageSource(source.html) && await isAnalyzableMenuUrl(source.finalUrl)) {
      return source.finalUrl;
    }
  }

  return "";
}

async function findAnalyzableMenuUrl(candidateUrls: string[]) {
  for (const candidateUrl of uniqueStrings(candidateUrls).slice(0, MAX_SOURCE_LINKS_TO_CHECK)) {
    if (await isAnalyzableMenuUrl(candidateUrl)) {
      return candidateUrl;
    }
  }

  return "";
}

async function isAnalyzableMenuUrl(candidateUrl: string) {
  if (looksLikePdfUrl(candidateUrl) && await isReachablePdfUrl(candidateUrl)) {
    return true;
  }

  try {
    const menuText = await loadMenuTextFromUrl(candidateUrl);
    return parseMenu(menuText).length >= MIN_ANALYZABLE_MENU_ITEMS || isLikelyMenuText(menuText);
  } catch {
    return false;
  }
}

async function isReachablePdfUrl(candidateUrl: string) {
  const normalizedUrl = normalizeOfficialUrl(candidateUrl);
  if (!normalizedUrl) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_LINK_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        Accept: "application/pdf,*/*;q=0.2",
        "User-Agent": SOURCE_FETCH_HEADERS["User-Agent"]
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) return false;

    const finalUrl = normalizeOfficialUrl(response.url || normalizedUrl);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    return looksLikePdfUrl(finalUrl) || contentType.includes("application/pdf");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function looksLikePdfUrl(value: string) {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function isLikelyMenuText(menuText: string) {
  const normalizedText = normalizeMenuProbeText(menuText);
  const priceCount = [...menuText.matchAll(/\d{1,3}(?:[.,]\d{2})/g)].length;
  const hasMenuTerm = MENU_SOURCE_TERMS.some((term) => normalizedText.includes(term));

  return menuText.trim().length >= MIN_LIKELY_MENU_TEXT_LENGTH &&
    priceCount >= MIN_LIKELY_MENU_PRICE_COUNT &&
    hasMenuTerm;
}

async function loadPageSource(sourceUrl: string) {
  const normalizedUrl = normalizeOfficialUrl(sourceUrl);
  if (!normalizedUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_SOURCE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      headers: SOURCE_FETCH_HEADERS,
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

function extractSourceLinks(html: string, baseUrl: string): SourceLink[] {
  const links: SourceLink[] = [];
  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null) {
    const url = normalizeOfficialUrl(match[1], baseUrl);
    if (!url) continue;

    links.push({
      url,
      label: htmlToPlainText(match[2] ?? "")
    });
  }

  return dedupeSourceLinks(links);
}

function looksLikeMenuSourceLink(link: SourceLink) {
  const value = normalizeMenuProbeText(`${link.url} ${link.label}`);
  return MENU_SOURCE_TERMS.some((term) => value.includes(term));
}

function looksLikeMenuPageSource(html: string) {
  const text = normalizeMenuProbeText(htmlToPlainText(html));
  const termHits = MENU_SOURCE_TERMS.filter((term) => text.includes(term)).length;
  return termHits >= 2;
}

function orderSourceMenuLinks(links: SourceLink[]) {
  return [...links].sort((left, right) => scoreSourceMenuLink(right) - scoreSourceMenuLink(left));
}

function scoreSourceMenuLink(link: SourceLink) {
  const value = normalizeMenuProbeText(`${link.url} ${link.label}`);
  const termScore = MENU_SOURCE_TERMS.reduce((score, term) => score + (value.includes(term) ? 2 : 0), 0);
  const pdfScore = link.url.toLowerCase().split("?")[0]?.endsWith(".pdf") ? 4 : 0;
  const labelScore = link.label.trim() ? 1 : 0;

  return termScore + pdfScore + labelScore;
}

function sourceMatchesRestaurant(html: string, finalUrl: string, candidate: RestaurantMenuDiscoveryRequest["candidate"]) {
  const pageText = normalizeDomainText(htmlToPlainText(html));
  if (isLikelyParkedWebsiteSource(pageText, finalUrl)) return false;

  const sourceText = `${pageText} ${normalizeDomainText(finalUrl)}`;
  const domainText = normalizeDomainText(finalUrl);
  const nameTokens = meaningfulRestaurantTokens(candidate.name);
  const addressTokens = meaningfulAddressTokens(candidate.address);
  const localityTokens = meaningfulLocalityTokens([candidate.city, candidate.address]);

  const hasNameToken = nameTokens.length === 0 || nameTokens.some((token) => sourceText.includes(token));
  const hasNameTokenInDomain = nameTokens.some((token) => domainText.includes(token));
  const hasLocationToken = addressTokens.length > 0
    ? addressTokens.some((token) => pageText.includes(token))
    : localityTokens.length === 0 || localityTokens.some((token) => pageText.includes(token));

  return hasNameToken && (hasLocationToken || (addressTokens.length === 0 && hasNameTokenInDomain));
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

function meaningfulRestaurantTokens(value: string) {
  return normalizeDomainText(value)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => !GENERIC_RESTAURANT_WORDS.has(token));
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

function buildLikelyOfficialOrigins(candidateName: string) {
  const slugs = buildLikelyDomainSlugs(candidateName);

  return LIKELY_OFFICIAL_DOMAIN_TLDS.flatMap((tld) => slugs.flatMap((slug) => [
    `https://www.${slug}.${tld}/`,
    `https://${slug}.${tld}/`
  ]));
}

function buildLikelyDomainSlugs(candidateName: string) {
  const words = normalizeDomainText(candidateName).split(" ").filter(Boolean);
  const meaningfulWords = words.filter((word) => !GENERIC_RESTAURANT_WORDS.has(word));
  const firstGenericWord = words.find((word) => GENERIC_RESTAURANT_WORDS.has(word));
  const meaningfulSlug = meaningfulWords.join("-");
  const compactMeaningfulSlug = meaningfulWords.join("");
  const fullSlug = words.join("-");
  const compactFullSlug = words.join("");

  return uniqueStrings([
    meaningfulSlug,
    compactMeaningfulSlug,
    meaningfulSlug ? `restaurant-${meaningfulSlug}` : "",
    compactMeaningfulSlug ? `restaurant${compactMeaningfulSlug}` : "",
    firstGenericWord && meaningfulSlug ? `${firstGenericWord}-${meaningfulSlug}` : "",
    firstGenericWord && compactMeaningfulSlug ? `${firstGenericWord}${compactMeaningfulSlug}` : "",
    fullSlug,
    compactFullSlug
  ].filter(Boolean));
}

function scoreDiscoveredCandidate(
  discoveredCandidate: RestaurantDiscoveryCandidate,
  selectedCandidate: RestaurantMenuDiscoveryRequest["candidate"]
) {
  const discoveredName = normalizeSearchText(discoveredCandidate.name).toLowerCase();
  const selectedName = normalizeSearchText(selectedCandidate.name).toLowerCase();
  const discoveredCity = normalizeSearchText(discoveredCandidate.city).toLowerCase();
  const selectedCity = normalizeSearchText(selectedCandidate.city).toLowerCase();
  const discoveredAddress = normalizeSearchText(discoveredCandidate.address ?? "").toLowerCase();
  const selectedAddress = normalizeSearchText(selectedCandidate.address).toLowerCase();
  const discoveredDomain = getRegistrableDomain(discoveredCandidate.websiteUrl ?? "");
  const selectedDomain = getRegistrableDomain(selectedCandidate.websiteUrl);
  let score = 0;

  if (selectedDomain && discoveredDomain === selectedDomain) score += 8;
  if (discoveredName === selectedName) score += 6;
  if (discoveredName.includes(selectedName) || selectedName.includes(discoveredName)) score += 3;
  if (selectedCity && discoveredCity === selectedCity) score += 3;
  if (selectedCity && (discoveredCity.includes(selectedCity) || selectedCity.includes(discoveredCity))) score += 1;
  if (selectedAddress && discoveredAddress && (discoveredAddress.includes(selectedAddress) || selectedAddress.includes(discoveredAddress))) score += 2;

  return score;
}

function inferCityFromAddress(address: string | undefined) {
  return address?.split(",").map((part) => part.trim()).filter(Boolean).pop() ?? "";
}

function normalizeSearchText(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMenuProbeText(value: string) {
  return normalizeSearchText(value).toLowerCase().replace(/ü/g, "ue");
}

function normalizeDomainText(value: string | undefined) {
  return normalizeSearchText(value)
    .replace(/ß/g, "ss")
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
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Auml;/gi, "Ä")
    .replace(/&Ouml;/gi, "Ö")
    .replace(/&Uuml;/gi, "Ü")
    .replace(/&szlig;/gi, "ß")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOfficialUrl(value: string | undefined, baseUrl?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
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

function getRegistrableDomain(value: string | undefined) {
  const normalized = normalizeOfficialUrl(value);
  if (!normalized) return "";

  try {
    const hostname = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join(".");
  } catch {
    return "";
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

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function dedupeSourceLinks(links: SourceLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
