import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../src/auth/requireUser";
import { AppError } from "../../../src/errors/AppError";
import { errorResponse } from "../../../src/errors/errorResponse";
import { loadMenuTextFromUrl } from "../../../src/menu/loadMenuTextFromUrl";
import { parseMenu } from "../../../src/menu/parseMenu";
import { getRestaurantDiscoveryCountryNames, getRestaurantDiscoveryCountryTlds } from "../../../src/restaurant/restaurantDiscoveryCountries";
import { selectRestaurantMenuSource } from "../../../src/restaurant/selectRestaurantMenuSource";

const MENU_DISCOVERY_TIMEOUT_MS = 22000;
const OFFICIAL_SOURCE_DISCOVERY_TIMEOUT_MS = 5000;
const PAGE_SOURCE_FETCH_TIMEOUT_MS = 4500;
const PDF_LINK_FETCH_TIMEOUT_MS = 4500;
const MAX_SOURCE_LINKS_TO_CHECK = 12;
const MAX_LINKED_MENU_ANALYSIS_CANDIDATES = 8;
const MIN_ANALYZABLE_MENU_TEXT_LENGTH = 120;
const MAX_LIKELY_ORIGINS_TO_CHECK = 14;
const SOURCE_FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
  "User-Agent": "GustaroAI/1.0 restaurant-menu-discovery (kontakt@gustaroai.com)"
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
const TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS = [
  "menualacarte.cloud"
];

const RestaurantMenuDiscoveryRequestSchema = z.object({
  candidate: z.object({
    id: z.string().optional().default(""),
    name: z.string().trim().min(1).max(160),
    city: z.string().trim().max(120).optional().default(""),
    country: z.string().trim().max(80).optional().default(""),
    address: z.string().trim().max(240).optional().default(""),
    websiteUrl: z.string().trim().max(500).optional().default(""),
    menuUrl: z.string().trim().max(500).optional().default("")
  })
});

type RestaurantMenuDiscoveryRequest = z.infer<typeof RestaurantMenuDiscoveryRequestSchema>;

type RestaurantMenuDiscoveryResult = {
  websiteUrl: string;
  menuUrl?: string;
  menuUrls?: string[];
  externalMenuCandidate?: ExternalMenuCandidate;
};

type SourceLink = {
  url: string;
  label: string;
};

type ExternalMenuCandidate = {
  url: string;
  providerDomain: string;
};

type MenuDiscoveryCandidateResult = {
  menuUrl?: string;
  externalMenuCandidate?: ExternalMenuCandidate;
};

type OfficialMenuCandidate = z.infer<typeof OfficialMenuSourceResponseSchema>["menuCandidates"][number];

type MenuSourceKind = "pdf" | "html" | "image";

type MenuSourceFamilyInfo = SourceLink & {
  index: number;
  sourceKind: MenuSourceKind;
  directoryKey: string;
  familyKey: string;
  partOrder: number;
};

const OfficialRestaurantSourceResponseSchema = z.object({
  candidates: z.array(z.object({
    name: z.string().optional().default(""),
    city: z.string().optional().default(""),
    address: z.string().optional().default(""),
    websiteUrl: z.string().optional().default(""),
    evidence: z.object({
      nameMatch: z.boolean().optional().default(false),
      cityMatch: z.boolean().optional().default(false),
      addressMatch: z.boolean().optional().default(false),
      officialSourceReason: z.string().optional().default(""),
      sourceUrl: z.string().optional().default("")
    }).optional().default({
      nameMatch: false,
      cityMatch: false,
      addressMatch: false,
      officialSourceReason: "",
      sourceUrl: ""
    })
  })).max(5).optional().default([])
});

const OfficialMenuSourceResponseSchema = z.object({
  menuCandidates: z.array(z.object({
    menuUrl: z.string().optional().default(""),
    sourceUrl: z.string().optional().default(""),
    evidence: z.object({
      sameDomain: z.boolean().optional().default(false),
      trustedExternalProvider: z.boolean().optional().default(false),
      officialSource: z.boolean().optional().default(false),
      publiclyReachable: z.boolean().optional().default(false),
      belongsToRestaurant: z.boolean().optional().default(false),
      reason: z.string().optional().default("")
    }).optional().default({
      sameDomain: false,
      trustedExternalProvider: false,
      officialSource: false,
      publiclyReachable: false,
      belongsToRestaurant: false,
      reason: ""
    })
  })).max(5).optional().default([])
});

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
  const discoveredWebsiteUrl = websiteUrl || await discoverOfficialRestaurantWebsite(candidate);

  if (!discoveredWebsiteUrl) {
    return { websiteUrl };
  }

  return mapSelectedRestaurantMenuSource(await selectRestaurantMenuSource({
    ...candidate,
    websiteUrl: discoveredWebsiteUrl
  }));
}

function mapSelectedRestaurantMenuSource(
  selection: Awaited<ReturnType<typeof selectRestaurantMenuSource>>
): RestaurantMenuDiscoveryResult {
  if (selection.externalMenuCandidate) {
    return {
      websiteUrl: selection.websiteUrl,
      externalMenuCandidate: selection.externalMenuCandidate
    };
  }

  return {
    websiteUrl: selection.websiteUrl,
    ...(selection.menuUrl ? { menuUrl: selection.menuUrl } : {}),
    ...(selection.menuUrls ? { menuUrls: selection.menuUrls } : {})
  };
}

async function findMenuInWebsiteSource(
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  websiteUrl: string
): Promise<RestaurantMenuDiscoveryResult> {
  if (websiteUrl) {
    const menuUrl = await findMenuFromOfficialSource(candidate, websiteUrl, false);
    const externalMenuCandidate = menuUrl
      ? undefined
      : await findTrustedExternalMenuFromWebsite(candidate, websiteUrl, false);
    const discoveredMenu: MenuDiscoveryCandidateResult = menuUrl || externalMenuCandidate
      ? {}
      : await discoverOfficialMenuSource(candidate, websiteUrl);
    return {
      websiteUrl,
      ...(menuUrl ? { menuUrl } : discoveredMenu),
      ...(externalMenuCandidate ? { externalMenuCandidate } : {})
    };
  }

  for (const origin of buildLikelyOfficialOrigins(candidate.name, candidate.country).slice(0, MAX_LIKELY_ORIGINS_TO_CHECK)) {
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

async function discoverOfficialRestaurantWebsite(candidate: RestaurantMenuDiscoveryRequest["candidate"]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_DISCOVERY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview", search_context_size: "medium" }],
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({
          intent: "official_restaurant_source",
          task: "Find the official public source for the exact restaurant. Use the structured intent, not fixed language terms. Return only JSON matching the schema.",
          schema: {
            candidates: [{
              name: "",
              city: "",
              address: "",
              websiteUrl: "",
              evidence: {
                nameMatch: false,
                cityMatch: false,
                addressMatch: false,
                officialSourceReason: "",
                sourceUrl: ""
              }
            }]
          },
          restaurantName: candidate.name,
          city: candidate.city || inferCityFromAddress(candidate.address),
          country: getRestaurantDiscoveryCountryNames(candidate.country)[0] ?? candidate.country,
          countryConstraint: candidate.country
            ? "Search only within the selected country. Do not return same-name restaurants or sources from other countries."
            : "",
          address: candidate.address
        })
      }]
    }]
  });

  const candidates = OfficialRestaurantSourceResponseSchema
    .parse(JSON.parse(stripJsonFence(response.output_text ?? "{}")))
    .candidates;

  for (const rawCandidate of candidates) {
    const websiteUrl = normalizeOfficialUrl(rawCandidate.websiteUrl);
    if (!websiteUrl) continue;

    const source = await loadPageSource(websiteUrl);
    if (!source) continue;
    if (!sourceMatchesRestaurant(source.html, source.finalUrl, {
      ...candidate,
      city: candidate.city || rawCandidate.city,
      address: candidate.address || rawCandidate.address
    })) continue;

    return source.finalUrl;
  }

  return "";
}

async function discoverOfficialMenuSource(
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  websiteUrl: string
): Promise<MenuDiscoveryCandidateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};

  const normalizedWebsiteUrl = normalizeOfficialUrl(websiteUrl);
  if (!normalizedWebsiteUrl) return {};

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_DISCOVERY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const menuCandidates = await requestOfficialMenuCandidates(client, model, candidate, normalizedWebsiteUrl);

  for (const menuCandidate of menuCandidates) {
    const candidateUrls = uniqueStrings([menuCandidate.menuUrl, menuCandidate.sourceUrl]).filter(Boolean);

    for (const candidateUrl of candidateUrls) {
      const verifiedUrl = await verifyOfficialMenuUrl(candidateUrl, normalizedWebsiteUrl);
      if (verifiedUrl) return { menuUrl: verifiedUrl };

      const verifiedExternalUrl = await verifyTrustedExternalMenuUrl(candidateUrl, candidate, normalizedWebsiteUrl);
      if (verifiedExternalUrl) return { externalMenuCandidate: verifiedExternalUrl };
    }
  }

  return {};
}

async function requestOfficialMenuCandidates(
  client: OpenAI,
  model: string,
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  normalizedWebsiteUrl: string
): Promise<OfficialMenuCandidate[]> {
  const prompts = buildOfficialMenuSourcePrompts(candidate, normalizedWebsiteUrl);

  for (const prompt of prompts) {
    try {
      const response = await client.responses.create({
        model,
        tools: [{ type: "web_search_preview", search_context_size: "high" }],
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: prompt
          }]
        }]
      });

      const menuCandidates = parseOfficialMenuCandidatesOutput(response.output_text ?? "{}");

      if (menuCandidates.length > 0) return menuCandidates;
    } catch {
      continue;
    }
  }

  return [];
}

function parseOfficialMenuCandidatesOutput(outputText: string): OfficialMenuCandidate[] {
  const stripped = stripJsonFence(outputText || "{}");
  const parsed = tryParseJsonObject(stripped);
  if (!parsed) return [];

  return OfficialMenuSourceResponseSchema.parse(parsed).menuCandidates;
}

function tryParseJsonObject(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;

    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}
function buildMenuSourceSearchQueries(candidate: RestaurantMenuDiscoveryRequest["candidate"], websiteUrl: string) {
  const restaurantName = candidate.name.trim();
  const city = (candidate.city || inferCityFromAddress(candidate.address)).trim();
  const country = (getRestaurantDiscoveryCountryNames(candidate.country)[0] ?? candidate.country).trim();
  const domain = getRegistrableDomain(websiteUrl);
  const base = [restaurantName, city, country].filter(Boolean).join(" ");
  const domainQuery = domain ? `site:${domain}` : "";
  const trustedProviderQueries = TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS.flatMap((providerDomain) => [
    [base, `site:${providerDomain}`].filter(Boolean).join(" "),
    [restaurantName, providerDomain].filter(Boolean).join(" ")
  ]);

  return uniqueStrings([
    [base, "official menu"].filter(Boolean).join(" "),
    [base, "menu pdf"].filter(Boolean).join(" "),
    ...trustedProviderQueries,
    [base, "restaurant menu"].filter(Boolean).join(" "),
    [domainQuery, restaurantName, "menu"].filter(Boolean).join(" "),
    [domainQuery, restaurantName, "pdf"].filter(Boolean).join(" ")
  ]).slice(0, 8);
}
function buildOfficialMenuSourcePrompts(candidate: RestaurantMenuDiscoveryRequest["candidate"], normalizedWebsiteUrl: string) {
  const restaurantName = candidate.name;
  const city = candidate.city || inferCityFromAddress(candidate.address);
  const country = getRestaurantDiscoveryCountryNames(candidate.country)[0] ?? candidate.country;
  const verifiedDomain = getRegistrableDomain(normalizedWebsiteUrl);
  const searchQueries = buildMenuSourceSearchQueries(candidate, normalizedWebsiteUrl);
  const schema = {
    menuCandidates: [{
      menuUrl: "",
      sourceUrl: "",
      evidence: {
        sameDomain: false,
        trustedExternalProvider: false,
        officialSource: false,
        publiclyReachable: false,
        belongsToRestaurant: false,
        reason: ""
      }
    }]
  };
  const sharedData = {
    schema,
    restaurantName,
    city,
    country,
    countryConstraint: candidate.country
      ? "Search only within the selected country. Do not return same-name restaurants or menu sources from other countries."
      : "",
    address: candidate.address,
    verifiedWebsiteUrl: normalizedWebsiteUrl,
    verifiedDomain,
    trustedExternalMenuProviders: TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS,
    searchQueries
  };

  return [
    JSON.stringify({
      intent: "official_menu_source",
      task: "Use web search to find the official or clearly restaurant-owned menu source for the exact restaurant. Return concrete menu page, PDF, or trusted external digital-menu URLs only. Return only JSON matching the schema.",
      externalMenuProviderPolicy: "Prefer same-domain menu sources. If no same-domain menu is analyzable, you may return a trusted external digital menu provider only when the provider page clearly belongs to this exact restaurant and contains actual menu items. Put every found menu page, PDF, or trusted external digital-menu URL directly into menuUrl. Use sourceUrl only as supporting evidence.",
      searchInstruction: "Use the searchQueries to search the web. Do not invent URLs. Return up to 5 concrete menu page, PDF, or trusted external digital-menu URLs in menuUrl. The code will verify every URL.",
      ...sharedData
    }),
    [
      "Find the official menu source for this exact restaurant.",
      "Return only valid JSON, no Markdown, exactly in this shape:",
      JSON.stringify(schema),
      `Restaurant: ${restaurantName}`,
      `City: ${city}`,
      `Country: ${country}`,
      `Address: ${candidate.address}`,
      `Official website: ${normalizedWebsiteUrl}`,
      `Official domain: ${verifiedDomain}`,
      `Search queries: ${searchQueries.join(" | ")}`,
      "Accept only official same-domain menu pages/PDFs or clearly matching trusted external digital menu providers.",
      "Put each concrete menu page, PDF, or trusted external digital-menu URL in menuUrl. Use sourceUrl only for the page where the URL was found.",
      "Do not return review sites, delivery services, map listings, reservation pages, social media, or same-name restaurants."
    ].join("\n")
  ];
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
    if (await isDirectlyAnalyzableMenuUrl(source.finalUrl)) {
      return source.finalUrl;
    }

    const websiteDomain = getRegistrableDomain(source.finalUrl);
    const sourceLinks = extractSourceLinks(source.html, source.finalUrl)
      .filter((link) => getRegistrableDomain(link.url) === websiteDomain);

    const menuUrl = await findVerifiedMenuUrl(sourceLinks.map((link) => link.url), source.finalUrl);
    if (menuUrl) return menuUrl;
  }

  return "";
}

async function verifyProvidedMenuUrl(
  candidateUrl: string | undefined,
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  websiteUrl: string
): Promise<MenuDiscoveryCandidateResult> {
  if (!candidateUrl) return {};

  const verifiedUrl = await verifyOfficialMenuUrl(candidateUrl, websiteUrl);
  if (verifiedUrl) return { menuUrl: verifiedUrl };

  const verifiedExternalUrl = await verifyTrustedExternalMenuUrl(candidateUrl, candidate, websiteUrl);
  return verifiedExternalUrl ? { externalMenuCandidate: verifiedExternalUrl } : {};
}
async function findTrustedExternalMenuFromWebsite(
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  websiteUrl: string,
  requireSourceMatch: boolean
): Promise<ExternalMenuCandidate | undefined> {
  const sourceUrls = uniqueStrings([websiteUrl, getOriginUrl(websiteUrl)]).filter(Boolean);

  for (const sourceUrl of sourceUrls) {
    const source = await loadPageSource(sourceUrl);
    if (!source) continue;
    if (requireSourceMatch && !sourceMatchesRestaurant(source.html, source.finalUrl, candidate)) continue;

    const candidateLinks = orderMenuCandidateLinks(
      extractSourceLinks(source.html, source.finalUrl)
        .filter((link) => isTrustedExternalMenuProviderUrl(link.url))
        .filter(looksLikeMenuSourceLink)
    );

    for (const candidateUrl of candidateLinks.map((link) => link.url).slice(0, MAX_LINKED_MENU_ANALYSIS_CANDIDATES)) {
      const verifiedExternalMenu = await verifyTrustedExternalMenuUrl(candidateUrl, candidate, source.finalUrl);
      if (verifiedExternalMenu) return verifiedExternalMenu;
    }
  }

  return undefined;
}

async function findVerifiedMenuUrl(candidateUrls: string[], websiteUrl: string) {
  for (const candidateUrl of orderMenuCandidateUrls(candidateUrls).slice(0, MAX_SOURCE_LINKS_TO_CHECK)) {
    const verifiedUrl = await verifyOfficialMenuUrl(candidateUrl, websiteUrl);
    if (verifiedUrl) {
      return verifiedUrl;
    }
  }

  return "";
}

async function verifyOfficialMenuUrl(candidateUrl: string, websiteUrl: string) {
  const normalizedUrl = normalizeOfficialUrl(candidateUrl, websiteUrl);
  const normalizedWebsiteUrl = normalizeOfficialUrl(websiteUrl);
  if (!normalizedUrl || !normalizedWebsiteUrl) return "";
  if (sameUrlWithoutTrailingSlash(normalizedUrl, normalizedWebsiteUrl)) return "";
  const websiteDomain = getRegistrableDomain(normalizedWebsiteUrl);
  if (getRegistrableDomain(normalizedUrl) !== websiteDomain) return "";

  const reachableUrl = looksLikePdfUrl(normalizedUrl)
    ? await verifyReachablePdfUrl(normalizedUrl)
    : await verifyReachablePageUrl(normalizedUrl);

  if (!reachableUrl) return "";
  if (getRegistrableDomain(reachableUrl) !== websiteDomain) return "";

  const analyzableUrl = await verifyAnalyzableMenuUrl(reachableUrl, websiteDomain);
  if (analyzableUrl) return analyzableUrl;

  return findLinkedAnalyzableMenuUrl(reachableUrl, websiteDomain);
}

async function verifyTrustedExternalMenuUrl(
  candidateUrl: string,
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  websiteUrl: string
): Promise<ExternalMenuCandidate | undefined> {
  const normalizedUrl = normalizeOfficialUrl(candidateUrl, websiteUrl);
  const normalizedWebsiteUrl = normalizeOfficialUrl(websiteUrl);
  if (!normalizedUrl || !normalizedWebsiteUrl) return undefined;
  if (sameUrlWithoutTrailingSlash(normalizedUrl, normalizedWebsiteUrl)) return undefined;

  const websiteDomain = getRegistrableDomain(normalizedWebsiteUrl);
  const providerDomain = getTrustedExternalMenuProviderDomain(normalizedUrl);
  if (!providerDomain || providerDomain === websiteDomain) return undefined;

  const reachableUrl = await verifyReachablePageUrl(normalizedUrl);
  if (!reachableUrl) return undefined;

  const reachableProviderDomain = getTrustedExternalMenuProviderDomain(reachableUrl);
  if (reachableProviderDomain !== providerDomain) return undefined;

  const linkedMenuUrl = await findLinkedTrustedExternalMenuUrl(reachableUrl, candidate, providerDomain);
  if (linkedMenuUrl) {
    return {
      url: linkedMenuUrl,
      providerDomain
    };
  }

  const directMenuUrl = await verifyDirectTrustedExternalMenuPage(reachableUrl, candidate);
  return directMenuUrl
    ? {
        url: directMenuUrl,
        providerDomain
      }
    : undefined;
}

async function verifyDirectTrustedExternalMenuPage(
  candidateUrl: string,
  candidate: RestaurantMenuDiscoveryRequest["candidate"]
) {
  try {
    const menuText = await loadMenuTextFromUrl(candidateUrl);
    if (!externalMenuPageMatchesRestaurant(menuText, candidateUrl, candidate)) return "";
    if (!isAnalyzableMenuText(menuText) && !hasTrustedExternalMenuTextSignals(menuText)) return "";

    return candidateUrl;
  } catch {
    return "";
  }
}

async function findLinkedTrustedExternalMenuUrl(
  pageUrl: string,
  candidate: RestaurantMenuDiscoveryRequest["candidate"],
  providerDomain: string
) {
  const source = await loadPageSource(pageUrl);
  if (!source) return "";
  if (getTrustedExternalMenuProviderDomain(source.finalUrl) !== providerDomain) return "";

  const candidateLinks = orderMenuCandidateLinks(
    extractSourceLinks(source.html, source.finalUrl)
      .filter((link) => getTrustedExternalMenuProviderDomain(link.url) === providerDomain)
      .filter((link) => !sameUrlWithoutTrailingSlash(link.url, pageUrl))
      .filter(looksLikeMenuSourceLink)
  );

  for (const candidateUrl of candidateLinks.map((link) => link.url).slice(0, MAX_LINKED_MENU_ANALYSIS_CANDIDATES)) {
    const reachableUrl = await verifyReachablePageUrl(candidateUrl);
    if (!reachableUrl) continue;
    if (getTrustedExternalMenuProviderDomain(reachableUrl) !== providerDomain) continue;

    const directMenuUrl = await verifyDirectTrustedExternalMenuPage(reachableUrl, candidate);
    if (directMenuUrl) return directMenuUrl;
  }

  return "";
}

function hasTrustedExternalMenuTextSignals(menuText: string) {
  const normalized = normalizeMenuProbeText(menuText);
  const priceMatches = menuText.match(/(?:€|eur|euro)\s*\d+|\d+\s*(?:€|eur|euro)|\d+[,.]\d{2}/gi) ?? [];
  const categoryHits = [
    "appetizers",
    "first courses",
    "second courses",
    "dessert",
    "tasting menu",
    "menu a la carte",
    "antipasti",
    "primi",
    "secondi",
    "dolci",
    "full list"
  ].filter((term) => normalized.includes(term)).length;

  return menuText.trim().length >= MIN_ANALYZABLE_MENU_TEXT_LENGTH &&
    priceMatches.length >= 2 &&
    categoryHits >= 1;
}
function externalMenuPageMatchesRestaurant(
  menuText: string,
  menuUrl: string,
  candidate: RestaurantMenuDiscoveryRequest["candidate"]
) {
  const sourceText = normalizeDomainText(`${menuText} ${menuUrl}`);
  const urlText = normalizeDomainText(menuUrl);
  const nameTokens = meaningfulRestaurantTokens(candidate.name);
  const addressTokens = meaningfulAddressTokens(candidate.address);
  const localityTokens = meaningfulLocalityTokens([
    candidate.city,
    candidate.address
  ]);

  const nameMatches = nameTokens.length === 0 ||
    nameTokens.some((token) => sourceText.includes(token)) ||
    nameTokens.some((token) => urlText.includes(token));
  const locationMatches = addressTokens.length > 0
    ? addressTokens.some((token) => sourceText.includes(token))
    : localityTokens.length === 0 || localityTokens.some((token) => sourceText.includes(token));

  return nameMatches && locationMatches;
}

async function verifyAnalyzableMenuUrl(candidateUrl: string, expectedDomain: string): Promise<string> {
  const normalizedUrl = normalizeOfficialUrl(candidateUrl);
  if (!normalizedUrl) return "";
  if (getRegistrableDomain(normalizedUrl) !== expectedDomain) return "";

  if (await isDirectlyAnalyzableMenuUrl(normalizedUrl)) {
    return normalizedUrl;
  }

  if (looksLikePdfUrl(normalizedUrl)) {
    return normalizedUrl;
  }

  const linkedMenuUrl = await findLinkedAnalyzableMenuUrl(normalizedUrl, expectedDomain);
  return linkedMenuUrl;
}

async function isDirectlyAnalyzableMenuUrl(candidateUrl: string) {
  try {
    const menuText = await loadMenuTextFromUrl(candidateUrl);
    return isAnalyzableMenuText(menuText);
  } catch {
    return false;
  }
}

function isAnalyzableMenuText(menuText: string) {
  const trimmed = menuText.trim();
  if (trimmed.length < MIN_ANALYZABLE_MENU_TEXT_LENGTH) return false;

  return parseMenu(trimmed).filter((dish) => dish.itemType !== "drink").length >= 2;
}

async function findLinkedAnalyzableMenuUrl(pageUrl: string, expectedDomain: string) {
  const source = await loadPageSource(pageUrl);
  if (!source) return "";
  if (getRegistrableDomain(source.finalUrl) !== expectedDomain) return "";

  const sourceLinks = extractSourceLinks(source.html, source.finalUrl)
    .filter((link) => getRegistrableDomain(link.url) === expectedDomain)
    .filter((link) => !sameUrlWithoutTrailingSlash(link.url, pageUrl));

  if (hasNormalMenuSourceFamily(sourceLinks)) {
    return source.finalUrl;
  }

  const candidateUrls = sourceLinks
    .map((link) => link.url)
    .filter(looksLikeMenuSourceUrl);

  for (const candidateUrl of orderMenuCandidateUrls(candidateUrls).slice(0, MAX_LINKED_MENU_ANALYSIS_CANDIDATES)) {
    const reachableUrl = looksLikePdfUrl(candidateUrl)
      ? await verifyReachablePdfUrl(candidateUrl)
      : await verifyReachablePageUrl(candidateUrl);

    if (!reachableUrl) continue;
    if (getRegistrableDomain(reachableUrl) !== expectedDomain) continue;
    if (looksLikePdfUrl(reachableUrl)) {
      return reachableUrl;
    }
    if (await isDirectlyAnalyzableMenuUrl(reachableUrl)) {
      return reachableUrl;
    }
  }

  return "";
}

function looksLikeMenuSourceUrl(value: string) {
  if (looksLikePdfUrl(value)) return true;

  try {
    const url = new URL(value);
    const normalized = normalizeMenuProbeText(`${url.pathname} ${url.search}`);
    return hasMenuSourceTerm(normalized);
  } catch {
    return false;
  }
}

function looksLikeMenuSourceLink(link: SourceLink) {
  if (looksLikeMenuSourceUrl(link.url)) return true;

  return hasMenuSourceTerm(normalizeMenuProbeText(`${link.label} ${link.url}`));
}

function hasMenuSourceTerm(value: string) {
  return ["menu", "menue", "speisekarte", "karte", "carta", "carte", "food", "dining", "gourmetkarte"]
    .some((term) => value.includes(term));
}

function hasNormalMenuSourceFamily(links: SourceLink[]) {
  const infos = links
    .map((link, index) => toMenuSourceFamilyInfo(link, index))
    .filter((info): info is MenuSourceFamilyInfo => Boolean(info));
  const groups = new Map<string, MenuSourceFamilyInfo[]>();

  for (const info of infos) {
    const key = `${info.sourceKind}:${info.directoryKey}:${info.familyKey}`;
    groups.set(key, [...(groups.get(key) ?? []), info]);
  }

  return [...groups.values()]
    .some((group) => uniqueStrings(group.map((info) => info.url)).length >= 2);
}

function toMenuSourceFamilyInfo(link: SourceLink, index: number): MenuSourceFamilyInfo | null {
  let url: URL;

  try {
    url = new URL(link.url);
  } catch {
    return null;
  }

  const sourceKind = getMenuSourceKind(link.url);
  const stem = getUrlStem(url);
  const probe = normalizeMenuSourceText(`${url.pathname} ${url.search} ${link.label}`);
  const keySource = normalizeMenuSourceText(`${stem} ${link.label}`);
  const partOrder = getMenuPartOrder(keySource);

  if (!partOrder) return null;
  if (!hasRegularMenuSourceTerm(probe)) return null;
  if (hasExcludedMenuSourceTerm(probe)) return null;

  const familyKey = normalizeMenuFamilyKey(keySource);
  if (!familyKey || familyKey === keySource) return null;

  return {
    ...link,
    index,
    sourceKind,
    directoryKey: `${url.origin.toLowerCase()}${getUrlDirectory(url)}`,
    familyKey,
    partOrder
  };
}

function getMenuSourceKind(value: string): MenuSourceKind {
  if (looksLikePdfUrl(value)) return "pdf";
  if (looksLikeImageSourceUrl(value)) return "image";
  return "html";
}

function looksLikeImageSourceUrl(value: string) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return [".png", ".jpg", ".jpeg", ".gif", ".webp"].some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}

function getUrlStem(url: URL) {
  const segment = safeDecodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  return segment.replace(/\.[a-z0-9]+$/i, "");
}

function getUrlDirectory(url: URL) {
  const pathname = url.pathname.toLowerCase();
  const index = pathname.lastIndexOf("/");
  return index >= 0 ? pathname.slice(0, index + 1) : "/";
}

function normalizeMenuFamilyKey(value: string) {
  return stripMenuPartMarkers(value)
    .replace(/\b(?:oeffnen|offnen|open|download|downloads|view|ansehen|pdf|html|jpg|jpeg|png|webp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMenuPartMarkers(value: string) {
  return value
    .replace(/\b(?:vorne|front|vorderseite)\b/g, " ")
    .replace(/\b(?:hinten|back|rueckseite|ruckseite)\b/g, " ")
    .replace(/\b(?:seite|page|teil|part)\s*\d+\b/g, " ")
    .replace(/\b(speisekarte|menu)\s+\d+\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getMenuPartOrder(value: string) {
  if (/\b(?:vorne|front|vorderseite)\b/.test(value)) return 1;
  if (/\b(?:hinten|back|rueckseite|ruckseite)\b/.test(value)) return 2;

  const numbered = value.match(/\b(?:seite|page|teil|part)\s*(\d+)\b/)
    ?? value.match(/\b(?:speisekarte|menu)\s+(\d+)\b/);
  return numbered ? Number(numbered[1]) || 0 : 0;
}

function hasRegularMenuSourceTerm(value: string) {
  return [
    "speisekarte",
    "restaurantkarte",
    "karte",
    "menu",
    "menue",
    "food menu",
    "main menu",
    "restaurant menu",
    "carte",
    "carta",
    "ementa",
    "menukaart",
    "a la carte",
    "ristorante",
    "restaurante",
    "restaurant"
  ].some((term) => value.includes(term));
}

function hasExcludedMenuSourceTerm(value: string) {
  return [
    "fruehstueck",
    "fruhstuck",
    "breakfast",
    "brunch",
    "colazione",
    "petit dejeuner",
    "desayuno",
    "pequeno almoco",
    "cafe da manha",
    "ontbijt",
    "tageskarte",
    "wochenkarte",
    "sonntagskarte",
    "aktionskarte",
    "saisonkarte",
    "getraenkekarte",
    "getrankekarte",
    "drinks",
    "beverages",
    "weinkarte",
    "wine",
    "dessertkarte",
    "dessert",
    "eventkarte",
    "cateringkarte"
  ].some((term) => value.includes(term));
}

function normalizeMenuSourceText(value: string) {
  return safeDecodeURIComponent(value)
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

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function orderMenuCandidateUrls(values: string[]) {
  return uniqueStrings(values).sort((left, right) => scoreMenuCandidateUrl(right) - scoreMenuCandidateUrl(left));
}

function orderMenuCandidateLinks(links: SourceLink[]) {
  const uniqueLinks = new Map<string, SourceLink>();

  for (const link of links) {
    const key = normalizeMenuCandidateUrlKey(link.url);
    if (!key || uniqueLinks.has(key)) continue;
    uniqueLinks.set(key, link);
  }

  return [...uniqueLinks.values()].sort((left, right) => scoreMenuCandidateLink(right) - scoreMenuCandidateLink(left));
}

function normalizeMenuCandidateUrlKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function scoreMenuCandidateLink(link: SourceLink) {
  const normalized = normalizeMenuProbeText(`${link.url} ${link.label}`);
  let score = scoreMenuCandidateUrl(link.url);

  if (normalized.includes("listfull")) score += 100;
  if (normalized.includes("full list")) score += 80;
  if (normalized.includes("lista completa")) score += 80;
  if (normalized.includes("complete menu")) score += 70;
  if (normalized.includes("menu completo")) score += 70;
  if (normalized.includes("menu a la carte")) score += 60;
  if (normalized.includes("a la carte")) score += 50;
  if (normalized.includes("menuai")) score -= 35;
  if (normalized.includes("tasting")) score -= 80;
  if (normalized.includes("degustazione")) score -= 80;
  if (normalized.includes("degustation")) score -= 80;
  if (normalized.includes("cocktail")) score -= 45;
  if (normalized.includes("wine")) score -= 45;
  if (normalized.includes("vini")) score -= 45;
  if (normalized.includes("bar")) score -= 25;

  return score;
}

function scoreMenuCandidateUrl(value: string) {
  const normalized = normalizeMenuProbeText(decodeURIComponent(value));
  let score = looksLikePdfUrl(value) ? 2 : 0;

  if (normalized.includes("listfull")) score += 14;
  if (normalized.includes("complete") || normalized.includes("completa")) score += 12;
  if (normalized.includes("speisekarte")) score += 12;
  if (normalized.includes("restaurantkarte")) score += 10;
  if (normalized.includes("a-la-carte") || normalized.includes("alacarte") || normalized.includes("la-carte")) score += 10;
  if (normalized.includes("menu")) score += 6;
  if (normalized.includes("menue")) score += 6;
  if (normalized.includes("food")) score += 5;
  if (normalized.includes("essen")) score += 5;
  if (normalized.includes("speisen")) score += 5;
  if (normalized.includes("karte")) score += 2;

  if (normalized.includes("fruehstueck")) score -= 4;
  if (normalized.includes("fruhstuck")) score -= 4;
  if (normalized.includes("breakfast")) score -= 4;
  if (normalized.includes("brunch")) score -= 4;

  return score;
}

async function verifyReachablePdfUrl(candidateUrl: string) {
  const normalizedUrl = normalizeOfficialUrl(candidateUrl);
  if (!normalizedUrl) return "";

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
    if (!response.ok) return "";

    const finalUrl = normalizeOfficialUrl(response.url || normalizedUrl);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    return looksLikePdfUrl(finalUrl) || contentType.includes("application/pdf") ? finalUrl : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function verifyReachablePageUrl(candidateUrl: string) {
  const normalizedUrl = normalizeOfficialUrl(candidateUrl);
  if (!normalizedUrl) return "";

  const source = await loadPageSource(normalizedUrl);
  return source?.finalUrl ?? "";
}

function looksLikePdfUrl(value: string) {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function sameUrlWithoutTrailingSlash(left: string, right: string) {
  return left.replace(/\/$/, "") === right.replace(/\/$/, "");
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

  links.push(...extractEmbeddedSourceLinks(html, baseUrl));

  return dedupeSourceLinks(links);
}

function extractEmbeddedSourceLinks(html: string, baseUrl: string): SourceLink[] {
  const links: SourceLink[] = [];
  const normalizedHtml = html.replace(/\\\//g, "/");
  const urlPattern = /(?:https?:\/\/|\/)[^\s"'<>\\]+\.pdf(?:[^\s"'<>\\]*)?/gi;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(normalizedHtml)) !== null) {
    const rawUrl = match[0];
    const url = normalizeOfficialUrl(rawUrl, baseUrl);
    if (!url) continue;

    links.push({
      url,
      label: ""
    });
  }

  return links;
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

function buildLikelyOfficialOrigins(candidateName: string, country: string | undefined) {
  const slugs = buildLikelyDomainSlugs(candidateName);
  const countryTlds = getRestaurantDiscoveryCountryTlds(country);
  const tlds = countryTlds.length > 0 ? countryTlds : LIKELY_OFFICIAL_DOMAIN_TLDS;

  return tlds.flatMap((tld) => slugs.flatMap((slug) => [
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

function isTrustedExternalMenuProviderUrl(value: string) {
  return Boolean(getTrustedExternalMenuProviderDomain(value));
}

function getTrustedExternalMenuProviderDomain(value: string | undefined) {
  const domain = getRegistrableDomain(value);
  return TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS.includes(domain) ? domain : "";
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

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}
