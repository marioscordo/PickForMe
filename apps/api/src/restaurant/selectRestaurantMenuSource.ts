import OpenAI from "openai";
import { z } from "zod";
import { loadMenuTextFromUrl } from "../menu/loadMenuTextFromUrl";
import { parseMenu } from "../menu/parseMenu";
import { getMenuSourceQualityMetrics } from "./menuSourceQuality";
import { getRestaurantDiscoveryCountryNames } from "./restaurantDiscoveryCountries";

export type RestaurantMenuSourceInput = {
  id?: string;
  name: string;
  city?: string;
  country?: string;
  address?: string;
  websiteUrl?: string;
  menuUrl?: string;
};

export type ExternalMenuSourceCandidate = {
  url: string;
  providerDomain: string;
};

export type RestaurantMenuSourceSelectionKind =
  | "official_menu_anchor"
  | "official_menu_page"
  | "official_menu_pdf_family"
  | "official_menu_pdf"
  | "external_menu_provider"
  | "none";

export type RestaurantMenuSourceRejectedCandidate = {
  url: string;
  label?: string;
  reason: string;
};

export type RestaurantMenuSourceSelectedCandidate = {
  kind: Exclude<RestaurantMenuSourceSelectionKind, "none">;
  url: string;
  urls: string[];
  label?: string;
  score: number;
  reason: string;
  providerDomain?: string;
};

export type RestaurantMenuSourceSelection = {
  kind: RestaurantMenuSourceSelectionKind;
  websiteUrl: string;
  menuUrl?: string;
  menuUrls?: string[];
  externalMenuCandidate?: ExternalMenuSourceCandidate;
  confidence: "high" | "medium" | "none";
  reason: string;
  selectedCandidate?: RestaurantMenuSourceSelectedCandidate;
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[];
};

type SourceLink = {
  url: string;
  label: string;
  sourceUrl: string;
};

type PageSource = {
  finalUrl: string;
  html: string;
};

type CandidateDraft = {
  kind: Exclude<RestaurantMenuSourceSelectionKind, "none">;
  url: string;
  urls?: string[];
  label?: string;
  sourceUrl: string;
  score: number;
  reason: string;
  providerDomain?: string;
};

type MenuSourceDiagnosticMetrics = {
  textLength: number;
  dishCount: number;
  priceCount: number;
};

type MenuSourceFamilyInfo = SourceLink & {
  directoryKey: string;
  familyKey: string;
  partOrder: number;
};

type OfficialMenuCandidate = z.infer<typeof OfficialMenuSourceResponseSchema>["menuCandidates"][number];

const PAGE_SOURCE_FETCH_TIMEOUT_MS = 4500;
const MENU_TEXT_FETCH_TIMEOUT_MS = 6500;
const MAX_PAGES_TO_SCAN = 2;
const TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS = [
  "menualacarte.cloud"
];

const SOURCE_FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
  "User-Agent": "GustaroAI/1.0 restaurant-menu-source-selection (kontakt@gustaroai.com)"
};

const REGULAR_MENU_TERMS = [
  "speisekarte",
  "restaurantkarte",
  "menu",
  "menue",
  "food menu",
  "main menu",
  "restaurant menu",
  "carte",
  "carta",
  "a la carte",
  "ristorante",
  "restaurante"
];

const STRONG_MENU_TERMS = [
  "speisekarte",
  "restaurantkarte",
  "food menu",
  "main menu",
  "restaurant menu",
  "menu completo",
  "complete menu",
  "a la carte",
  "menue",
  "menu",
  "carta",
  "carte"
];

const EXCLUDED_MENU_TERMS = [
  "fruehstueck",
  "fruhstuck",
  "breakfast",
  "brunch",
  "colazione",
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
  "vini",
  "cocktail",
  "bar",
  "dessertkarte",
  "dessert",
  "eventkarte",
  "cateringkarte"
];

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

export async function selectRestaurantMenuSource(
  input: RestaurantMenuSourceInput
): Promise<RestaurantMenuSourceSelection> {
  const rejectedCandidates: RestaurantMenuSourceRejectedCandidate[] = [];
  const websiteUrl = normalizeOfficialUrl(input.websiteUrl);

  if (!websiteUrl) {
    return buildNoSelection("", "missing_website_url", rejectedCandidates);
  }

  const websiteDomain = getRegistrableDomain(websiteUrl);
  const trustedWebsiteProviderDomain = getTrustedExternalMenuProviderDomain(websiteUrl);

  if (trustedWebsiteProviderDomain) {
    const externalCandidate = await buildTrustedExternalProviderCandidate(
      websiteUrl,
      trustedWebsiteProviderDomain,
      input,
      rejectedCandidates
    );

    if (externalCandidate) {
      return buildSelection(websiteUrl, externalCandidate, rejectedCandidates);
    }

    const linkedExternalCandidate = await findTrustedExternalCandidateFromProviderPage(
      websiteUrl,
      trustedWebsiteProviderDomain,
      input,
      rejectedCandidates
    );

    if (linkedExternalCandidate) {
      return buildSelection(websiteUrl, linkedExternalCandidate, rejectedCandidates);
    }

    return buildNoSelection(websiteUrl, "no_plausible_external_menu_source", rejectedCandidates);
  }

  const pageSources = await loadSourcePagesToInspect(websiteUrl);
  const sourceLinks = dedupeSourceLinks(pageSources.flatMap((source) => extractSourceLinks(source.html, source.finalUrl)));
  const sameDomainLinks = sourceLinks.filter((link) => getRegistrableDomain(link.url) === websiteDomain);
  const candidates: CandidateDraft[] = [];

  for (const pageSource of pageSources) {
    const pageCandidate = await buildOfficialPageCandidate(pageSource, websiteDomain, rejectedCandidates);
    if (pageCandidate) {
      candidates.push(pageCandidate);
    }
  }

  candidates.push(...buildOfficialAnchorCandidates(sameDomainLinks, websiteUrl, rejectedCandidates));
  candidates.push(...buildOfficialPdfFamilyCandidates(sameDomainLinks, rejectedCandidates));

  for (const link of sameDomainLinks) {
    const candidate = await buildOfficialLinkCandidate(link, websiteDomain, rejectedCandidates);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const explicitMenuUrl = normalizeOfficialUrl(input.menuUrl, websiteUrl);
  if (explicitMenuUrl && getRegistrableDomain(explicitMenuUrl) === websiteDomain) {
    const explicitCandidate = await buildOfficialLinkCandidate({
      url: explicitMenuUrl,
      label: "provided menuUrl",
      sourceUrl: websiteUrl
    }, websiteDomain, rejectedCandidates);

    if (explicitCandidate) {
      candidates.push({
        ...explicitCandidate,
        score: explicitCandidate.score + 40,
        reason: `provided_${explicitCandidate.reason}`
      });
    }
  }

  for (const link of sourceLinks) {
    const providerDomain = getTrustedExternalMenuProviderDomain(link.url);
    if (!providerDomain || providerDomain === websiteDomain) continue;
    const externalCandidate = await buildTrustedExternalProviderCandidate(
      link.url,
      providerDomain,
      input,
      rejectedCandidates,
      link.label
    );
    if (externalCandidate) {
      candidates.push(externalCandidate);
    }
  }

  let candidatesForDiagnostics = candidates;
  let selected = orderCandidates(candidatesForDiagnostics)[0];
  if (!selected) {
    const aiCandidates = await discoverMenuSourcesWithAi(input, websiteUrl, websiteDomain, rejectedCandidates);
    candidatesForDiagnostics = aiCandidates;
    selected = orderCandidates(aiCandidates)[0];
  }

  await logMenuDiscoveryDiagnostic(input, websiteUrl, candidatesForDiagnostics, selected);

  if (!selected) {
    return buildNoSelection(websiteUrl, "no_plausible_menu_source", rejectedCandidates);
  }

  return buildSelection(websiteUrl, selected, rejectedCandidates);
}

async function loadSourcePagesToInspect(websiteUrl: string) {
  const urls = uniqueStrings([websiteUrl, getOriginUrl(websiteUrl)]).slice(0, MAX_PAGES_TO_SCAN);
  const sources: PageSource[] = [];

  for (const url of urls) {
    const source = await loadPageSource(url);
    if (source) {
      sources.push(source);
    }
  }

  return dedupePageSources(sources);
}

async function buildOfficialPageCandidate(
  source: PageSource,
  websiteDomain: string,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
): Promise<CandidateDraft | null> {
  if (getRegistrableDomain(source.finalUrl) !== websiteDomain) return null;

  const probe = normalizeMenuText(`${source.finalUrl} ${htmlToPlainText(source.html)}`);
  if (hasExcludedMenuTerm(probe) && !hasStrongMenuTerm(probe)) {
    rejectedCandidates.push({
      url: source.finalUrl,
      reason: "page_looks_like_excluded_menu_type"
    });
    return null;
  }

  if (!await isAnalyzableMenuUrl(source.finalUrl)) return null;

  return {
    kind: "official_menu_page",
    url: source.finalUrl,
    sourceUrl: source.finalUrl,
    score: 660 + scoreMenuSignal(source.finalUrl),
    reason: "official_page_contains_menu_items"
  };
}

function buildOfficialAnchorCandidates(
  links: SourceLink[],
  websiteUrl: string,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
) {
  const websiteWithoutHash = stripHash(websiteUrl).replace(/\/$/, "");
  const candidates: CandidateDraft[] = [];

  for (const link of links) {
    const linkWithoutHash = stripHash(link.url).replace(/\/$/, "");
    const hash = getUrlHash(link.url);
    if (!hash || linkWithoutHash !== websiteWithoutHash) continue;

    const probe = normalizeMenuText(`${hash} ${link.label}`);
    if (!hasStrongMenuTerm(probe)) {
      rejectedCandidates.push({
        url: link.url,
        label: link.label,
        reason: "same_page_anchor_without_strong_menu_signal"
      });
      continue;
    }

    if (hasExcludedMenuTerm(probe)) {
      rejectedCandidates.push({
        url: link.url,
        label: link.label,
        reason: "same_page_anchor_looks_like_excluded_menu_type"
      });
      continue;
    }

    candidates.push({
      kind: "official_menu_anchor",
      url: link.url,
      label: link.label,
      sourceUrl: link.sourceUrl,
      score: 900 + scoreMenuSignal(`${hash} ${link.label}`),
      reason: "official_same_page_anchor_with_strong_menu_label"
    });
  }

  return candidates;
}

function buildOfficialPdfFamilyCandidates(
  links: SourceLink[],
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
) {
  const groups = new Map<string, MenuSourceFamilyInfo[]>();

  for (const link of links) {
    const info = toMenuSourceFamilyInfo(link, rejectedCandidates);
    if (!info) continue;
    const key = `${info.directoryKey}:${info.familyKey}`;
    groups.set(key, [...(groups.get(key) ?? []), info]);
  }

  const candidates: CandidateDraft[] = [];

  for (const group of groups.values()) {
    const urls = uniqueStrings(group
      .sort((left, right) => left.partOrder - right.partOrder)
      .map((info) => info.url));
    if (urls.length < 2) continue;
    const firstUrl = urls[0];
    if (!firstUrl) continue;

    candidates.push({
      kind: "official_menu_pdf_family",
      url: firstUrl,
      urls,
      label: group.map((info) => info.label).filter(Boolean).join(" / "),
      sourceUrl: group[0]?.sourceUrl ?? firstUrl,
      score: 960 + urls.length * 20,
      reason: "official_pdf_menu_family"
    });
  }

  return candidates;
}

async function buildOfficialLinkCandidate(
  link: SourceLink,
  websiteDomain: string,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
): Promise<CandidateDraft | null> {
  if (getRegistrableDomain(link.url) !== websiteDomain) return null;

  const probe = normalizeMenuText(`${link.url} ${link.label}`);
  const isPdf = looksLikePdfUrl(link.url);
  const isAnchor = Boolean(getUrlHash(link.url));

  if (hasExcludedMenuTerm(probe)) {
    rejectedCandidates.push({
      url: link.url,
      label: link.label,
      reason: "excluded_menu_type"
    });
    return null;
  }

  if (!isPdf && isAnchor) {
    return null;
  }

  if (!hasRegularMenuTerm(probe) && !isPdf) {
    rejectedCandidates.push({
      url: link.url,
      label: link.label,
      reason: "missing_menu_signal"
    });
    return null;
  }

  if (isPdf) {
    if (!hasRegularMenuTerm(probe)) {
      rejectedCandidates.push({
        url: link.url,
        label: link.label,
        reason: "pdf_without_regular_menu_signal"
      });
      return null;
    }

    return {
      kind: "official_menu_pdf",
      url: link.url,
      label: link.label,
      sourceUrl: link.sourceUrl,
      score: 760 + scoreMenuSignal(probe),
      reason: "official_pdf_with_regular_menu_signal"
    };
  }

  if (await isAnalyzableMenuUrl(link.url)) {
    return {
      kind: "official_menu_page",
      url: link.url,
      label: link.label,
      sourceUrl: link.sourceUrl,
      score: 720 + scoreMenuSignal(probe),
      reason: "official_linked_page_contains_menu_items"
    };
  }

  if (hasStrongMenuTerm(probe)) {
    return {
      kind: "official_menu_page",
      url: link.url,
      label: link.label,
      sourceUrl: link.sourceUrl,
      score: 690 + scoreMenuSignal(probe),
      reason: "official_linked_page_with_strong_menu_signal"
    };
  }

  rejectedCandidates.push({
    url: link.url,
    label: link.label,
    reason: "linked_page_not_analyzable"
  });
  return null;
}

async function buildTrustedExternalProviderCandidate(
  url: string,
  providerDomain: string,
  input: RestaurantMenuSourceInput,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[],
  label = ""
): Promise<CandidateDraft | null> {
  const normalizedUrl = normalizeOfficialUrl(url);
  if (!normalizedUrl) return null;

  try {
    const menuText = await withTimeout(
      loadMenuTextFromUrl(normalizedUrl),
      MENU_TEXT_FETCH_TIMEOUT_MS,
      ""
    );
    const sourceText = normalizeDomainText(`${menuText} ${normalizedUrl}`);

    if (!externalSourceMatchesRestaurant(sourceText, input)) {
      rejectedCandidates.push({
        url: normalizedUrl,
        label,
        reason: "external_provider_does_not_match_restaurant"
      });
      return null;
    }

    if (!isAnalyzableMenuText(menuText) && !hasTrustedExternalMenuTextSignals(menuText)) {
      rejectedCandidates.push({
        url: normalizedUrl,
        label,
        reason: "external_provider_without_menu_items"
      });
      return null;
    }

    return {
      kind: "external_menu_provider",
      url: normalizedUrl,
      label,
      sourceUrl: normalizedUrl,
      providerDomain,
      score: 700 + scoreMenuSignal(`${normalizedUrl} ${label}`),
      reason: "trusted_external_provider_matches_restaurant"
    };
  } catch {
    rejectedCandidates.push({
      url: normalizedUrl,
      label,
      reason: "external_provider_load_failed"
    });
    return null;
  }
}

async function findTrustedExternalCandidateFromProviderPage(
  websiteUrl: string,
  providerDomain: string,
  input: RestaurantMenuSourceInput,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
) {
  const source = await loadPageSource(websiteUrl);
  if (!source) return null;

  const providerLinks = extractSourceLinks(source.html, source.finalUrl)
    .filter((link) => getTrustedExternalMenuProviderDomain(link.url) === providerDomain)
    .filter((link) => hasRegularMenuTerm(`${link.url} ${link.label}`) || hasStrongMenuTerm(`${link.url} ${link.label}`));

  const candidates: CandidateDraft[] = [];

  for (const link of providerLinks) {
    const candidate = await buildTrustedExternalProviderCandidate(
      link.url,
      providerDomain,
      input,
      rejectedCandidates,
      link.label
    );

    if (candidate) {
      candidates.push({
        ...candidate,
        score: candidate.score + scoreMenuSignal(`${link.url} ${link.label}`)
      });
    }
  }

  return orderCandidates(candidates)[0] ?? null;
}

async function discoverMenuSourcesWithAi(
  input: RestaurantMenuSourceInput,
  websiteUrl: string,
  websiteDomain: string,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_DISCOVERY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const parsed = await requestOfficialMenuCandidates(client, model, input, websiteUrl, websiteDomain);
    if (parsed.length === 0) {
      rejectedCandidates.push({
        url: websiteUrl,
        reason: "ai_menu_source_no_candidates"
      });
    }
    return buildAiVerifiedCandidates(parsed, input, websiteUrl, websiteDomain, rejectedCandidates);
  } catch {
    rejectedCandidates.push({
      url: websiteUrl,
      reason: "ai_menu_source_discovery_failed"
    });
    return [];
  }
}

async function requestOfficialMenuCandidates(
  client: OpenAI,
  model: string,
  input: RestaurantMenuSourceInput,
  websiteUrl: string,
  websiteDomain: string
) {
  const prompts = buildOfficialMenuSourcePrompts(input, websiteUrl, websiteDomain);

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

function buildOfficialMenuSourcePrompts(
  input: RestaurantMenuSourceInput,
  websiteUrl: string,
  websiteDomain: string
) {
  const restaurantName = input.name;
  const city = input.city ?? "";
  const country = getRestaurantDiscoveryCountryNames(input.country)[0] ?? input.country ?? "";
  const searchQueries = buildMenuSourceSearchQueries(input, websiteUrl);
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
    countryConstraint: input.country
      ? "Search only within the selected country. Do not return same-name restaurants or menu sources from other countries."
      : "",
    address: input.address ?? "",
    verifiedWebsiteUrl: websiteUrl,
    verifiedDomain: websiteDomain,
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
      `Address: ${input.address ?? ""}`,
      `Official website: ${websiteUrl}`,
      `Official domain: ${websiteDomain}`,
      `Search queries: ${searchQueries.join(" | ")}`,
      "Accept only official same-domain menu pages/PDFs or clearly matching trusted external digital menu providers.",
      "Put each concrete menu page, PDF, or trusted external digital-menu URL in menuUrl. Use sourceUrl only for the page where the URL was found.",
      "Do not return review sites, delivery services, map listings, reservation pages, social media, or same-name restaurants."
    ].join("\n")
  ];
}

function buildMenuSourceSearchQueries(input: RestaurantMenuSourceInput, websiteUrl: string) {
  const restaurantName = input.name.trim();
  const city = (input.city ?? "").trim();
  const country = (getRestaurantDiscoveryCountryNames(input.country)[0] ?? input.country ?? "").trim();
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

async function buildAiVerifiedCandidates(
  menuCandidates: OfficialMenuCandidate[],
  input: RestaurantMenuSourceInput,
  websiteUrl: string,
  websiteDomain: string,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
) {
  const sourceLinks = dedupeSourceLinks(menuCandidates.flatMap((candidate) => {
    return uniqueStrings([candidate.menuUrl, candidate.sourceUrl])
      .map((url) => normalizeOfficialUrl(url, websiteUrl, { preserveHash: true }))
      .filter(Boolean)
      .map((url) => ({
        url,
        label: "ai menu source",
        sourceUrl: websiteUrl
      }));
  }));

  const candidates: CandidateDraft[] = buildOfficialPdfFamilyCandidates(
    sourceLinks.filter((link) => getRegistrableDomain(link.url) === websiteDomain),
    rejectedCandidates
  ).map((candidate) => ({
    ...candidate,
    score: candidate.score + 20,
    reason: `ai_discovered_${candidate.reason}`
  }));

  for (const link of sourceLinks) {
    const domain = getRegistrableDomain(link.url);
    if (domain === websiteDomain) {
      const candidate = await buildOfficialLinkCandidate(link, websiteDomain, rejectedCandidates);
      if (candidate) {
        candidates.push({
          ...candidate,
          score: candidate.score + 20,
          reason: `ai_discovered_${candidate.reason}`
        });
      }
      continue;
    }

    const providerDomain = getTrustedExternalMenuProviderDomain(link.url);
    if (!providerDomain) {
      rejectedCandidates.push({
        url: link.url,
        label: link.label,
        reason: "ai_discovered_unsupported_external_domain"
      });
      continue;
    }

    const externalCandidate = await buildTrustedExternalProviderCandidate(
      link.url,
      providerDomain,
      input,
      rejectedCandidates,
      link.label
    ) ?? await findTrustedExternalCandidateFromProviderPage(
      link.url,
      providerDomain,
      input,
      rejectedCandidates
    );

    if (externalCandidate) {
      candidates.push({
        ...externalCandidate,
        score: externalCandidate.score + 20,
        reason: `ai_discovered_${externalCandidate.reason}`
      });
    }
  }

  return candidates;
}

function toMenuSourceFamilyInfo(
  link: SourceLink,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
): MenuSourceFamilyInfo | null {
  if (!looksLikePdfUrl(link.url)) return null;

  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    return null;
  }

  const stem = getUrlStem(url);
  const probe = normalizeMenuText(`${url.pathname} ${url.search} ${link.label}`);
  const keySource = normalizeMenuText(`${stem} ${link.label}`);
  const partOrder = getMenuPartOrder(keySource);

  if (!partOrder) return null;
  if (!hasRegularMenuTerm(probe)) return null;
  if (hasExcludedMenuTerm(probe)) {
    rejectedCandidates.push({
      url: link.url,
      label: link.label,
      reason: "pdf_family_candidate_excluded_menu_type"
    });
    return null;
  }

  const familyKey = normalizeMenuFamilyKey(keySource);
  if (!familyKey || familyKey === keySource) return null;

  return {
    ...link,
    directoryKey: `${url.origin.toLowerCase()}${getUrlDirectory(url)}`,
    familyKey,
    partOrder
  };
}

function buildSelection(
  websiteUrl: string,
  selected: CandidateDraft,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
): RestaurantMenuSourceSelection {
  const urls = selected.urls ?? [selected.url];
  const selectedCandidate: RestaurantMenuSourceSelectedCandidate = {
    kind: selected.kind,
    url: selected.url,
    urls,
    ...(selected.label ? { label: selected.label } : {}),
    score: selected.score,
    reason: selected.reason,
    ...(selected.providerDomain ? { providerDomain: selected.providerDomain } : {})
  };

  if (selected.kind === "external_menu_provider" && selected.providerDomain) {
    return {
      kind: selected.kind,
      websiteUrl,
      externalMenuCandidate: {
        url: selected.url,
        providerDomain: selected.providerDomain
      },
      confidence: "high",
      reason: selected.reason,
      selectedCandidate,
      rejectedCandidates
    };
  }

  return {
    kind: selected.kind,
    websiteUrl,
    menuUrl: selected.url,
    menuUrls: urls,
    confidence: selected.score >= 760 ? "high" : "medium",
    reason: selected.reason,
    selectedCandidate,
    rejectedCandidates
  };
}

function buildNoSelection(
  websiteUrl: string,
  reason: string,
  rejectedCandidates: RestaurantMenuSourceRejectedCandidate[]
): RestaurantMenuSourceSelection {
  return {
    kind: "none",
    websiteUrl,
    confidence: "none",
    reason,
    rejectedCandidates
  };
}

async function logMenuDiscoveryDiagnostic(
  input: RestaurantMenuSourceInput,
  websiteUrl: string,
  candidates: CandidateDraft[],
  selected: CandidateDraft | undefined
) {
  const orderedCandidates = orderCandidates(candidates);
  const rows = await Promise.all(orderedCandidates.map(async (candidate) => {
    const metrics = await getMenuSourceDiagnosticMetrics(candidate.url);

    return {
      url: candidate.url,
      kind: candidate.kind,
      score: candidate.score,
      reason: candidate.reason,
      textLength: metrics.textLength,
      dishCount: metrics.dishCount,
      priceCount: metrics.priceCount
    };
  }));

  console.info("[GUSTARO_MENU_DISCOVERY_DIAG]", JSON.stringify({
    restaurant: input.name,
    website: websiteUrl,
    selectedUrl: selected?.url ?? "",
    selectedKind: selected?.kind ?? "none",
    selectedScore: selected?.score ?? 0,
    selectedReason: selected?.reason ?? "no_selection",
    candidates: rows
  }));
}

async function getMenuSourceDiagnosticMetrics(url: string): Promise<MenuSourceDiagnosticMetrics> {
  const metrics = await getMenuSourceQualityMetrics(url);

  return {
    textLength: metrics.textLength,
    dishCount: metrics.dishCount,
    priceCount: metrics.priceCount
  };
}

async function loadPageSource(sourceUrl: string): Promise<PageSource | null> {
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
    const url = normalizeOfficialUrl(match[1], baseUrl, { preserveHash: true });
    if (!url) continue;

    links.push({
      url,
      label: htmlToPlainText(match[2] ?? ""),
      sourceUrl: baseUrl
    });
  }

  links.push(...extractEmbeddedPdfLinks(html, baseUrl));

  return dedupeSourceLinks(links);
}

function extractEmbeddedPdfLinks(html: string, baseUrl: string): SourceLink[] {
  const links: SourceLink[] = [];
  const normalizedHtml = html.replace(/\\\//g, "/");
  const urlPattern = /(?:https?:\/\/|\/)[^\s"'<>\\]+\.pdf(?:[^\s"'<>\\]*)?/gi;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(normalizedHtml)) !== null) {
    const url = normalizeOfficialUrl(match[0], baseUrl);
    if (!url) continue;

    links.push({
      url,
      label: "",
      sourceUrl: baseUrl
    });
  }

  return links;
}

async function isAnalyzableMenuUrl(value: string) {
  try {
    const menuText = await withTimeout(loadMenuTextFromUrl(value), MENU_TEXT_FETCH_TIMEOUT_MS, "");
    return isAnalyzableMenuText(menuText);
  } catch {
    return false;
  }
}

function isAnalyzableMenuText(menuText: string) {
  const trimmed = menuText.trim();
  if (trimmed.length < 120) return false;

  return parseMenu(trimmed).filter((dish) => dish.itemType !== "drink").length >= 2;
}

function hasTrustedExternalMenuTextSignals(menuText: string) {
  const normalized = normalizeMenuText(menuText);
  const priceMatches = menuText.match(/(?:€|eur|euro)\s*\d+|\d+\s*(?:€|eur|euro)|\d+[,.]\d{2}/gi) ?? [];
  const menuSignals = [
    "antipasti",
    "primi",
    "secondi",
    "pasta",
    "pizza",
    "dolci",
    "menu a la carte",
    "speisekarte",
    "ristorante"
  ];

  return menuText.trim().length >= 120 &&
    priceMatches.length >= 2 &&
    menuSignals.some((term) => normalized.includes(term));
}

function externalSourceMatchesRestaurant(sourceText: string, input: RestaurantMenuSourceInput) {
  const nameTokens = meaningfulTokens(input.name);
  const addressTokens = meaningfulTokens(input.address ?? "");
  const cityTokens = meaningfulTokens(input.city ?? "");

  const hasNameToken = nameTokens.length === 0 || nameTokens.some((token) => sourceText.includes(token));
  const hasAddressOrCity = addressTokens.length > 0
    ? addressTokens.some((token) => sourceText.includes(token))
    : cityTokens.length === 0 || cityTokens.some((token) => sourceText.includes(token));

  return hasNameToken && hasAddressOrCity;
}

function scoreMenuSignal(value: string) {
  const normalized = normalizeMenuText(value);
  let score = 0;

  if (normalized.includes("speisekarte")) score += 60;
  if (normalized.includes("restaurantkarte")) score += 48;
  if (normalized.includes("food menu")) score += 45;
  if (normalized.includes("main menu")) score += 44;
  if (normalized.includes("menu completo")) score += 44;
  if (normalized.includes("complete menu")) score += 44;
  if (normalized.includes("a la carte")) score += 38;
  if (normalized.includes("menue")) score += 34;
  if (normalized.includes("menu")) score += 30;
  if (normalized.includes("carta")) score += 26;
  if (normalized.includes("carte")) score += 22;
  if (looksLikePdfUrl(value)) score += 8;
  if (hasExcludedMenuTerm(normalized)) score -= 120;

  return score;
}

function orderCandidates(candidates: CandidateDraft[]) {
  const uniqueCandidates = new Map<string, CandidateDraft>();

  for (const candidate of candidates) {
    const key = candidate.kind === "official_menu_pdf_family"
      ? `${candidate.kind}:${candidate.urls?.join("|") ?? candidate.url}`
      : `${candidate.kind}:${candidate.url}`;
    const existing = uniqueCandidates.get(key);
    if (!existing || candidate.score > existing.score) {
      uniqueCandidates.set(key, candidate);
    }
  }

  return [...uniqueCandidates.values()].sort((left, right) => right.score - left.score);
}

function hasRegularMenuTerm(value: string) {
  const normalized = normalizeMenuText(value);
  return REGULAR_MENU_TERMS.some((term) => normalized.includes(term));
}

function hasStrongMenuTerm(value: string) {
  const normalized = normalizeMenuText(value);
  return STRONG_MENU_TERMS.some((term) => normalized.includes(term));
}

function hasExcludedMenuTerm(value: string) {
  const normalized = normalizeMenuText(value);
  return EXCLUDED_MENU_TERMS.some((term) => normalized.includes(term));
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

function getUrlStem(url: URL) {
  const segment = safeDecodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  return segment.replace(/\.[a-z0-9]+$/i, "");
}

function getUrlDirectory(url: URL) {
  const pathname = url.pathname.toLowerCase();
  const index = pathname.lastIndexOf("/");
  return index >= 0 ? pathname.slice(0, index + 1) : "/";
}

function getUrlHash(value: string) {
  try {
    return new URL(value).hash;
  } catch {
    return "";
  }
}

function stripHash(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function looksLikePdfUrl(value: string) {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function normalizeOfficialUrl(
  value: string | undefined,
  baseUrl?: string,
  options?: { preserveHash?: boolean }
) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!options?.preserveHash) {
      url.hash = "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function stripJsonFence(value: string) {
  return value.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
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

function getTrustedExternalMenuProviderDomain(value: string | undefined) {
  const domain = getRegistrableDomain(value);
  return TRUSTED_EXTERNAL_MENU_PROVIDER_DOMAINS.find((provider) => domain === provider) ?? "";
}

function normalizeMenuText(value: string) {
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

function normalizeDomainText(value: string) {
  return normalizeMenuText(value);
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return normalizeDomainText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !["restaurant", "ristorante", "trattoria", "pizzeria", "der", "die", "das"].includes(token));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function dedupePageSources(values: PageSource[]) {
  const seen = new Set<string>();
  return values.filter((source) => {
    const key = stripHash(source.finalUrl).replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeSourceLinks(values: SourceLink[]) {
  const seen = new Set<string>();
  return values.filter((link) => {
    const key = `${link.url}|${link.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
