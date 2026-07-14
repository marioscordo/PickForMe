export type RestaurantDescriptionResult = {
  text: string;
  source: "official_website";
  sourceUrl: string;
};

export type RestaurantDescriptionDiagnostics = {
  budgetRemainingMs?: number;
  contentLength?: number;
  contentType?: string;
  durationMs: number;
  errorName?: string;
  finalUrl?: string;
  htmlLength?: number;
  inputUrl?: string;
  linkedUrlCount?: number;
  pageIndex?: number;
  resultCount?: number;
  selectedTextLength?: number;
  sourceUrl?: string;
  status?: number;
  textFound?: boolean;
  timeoutMs?: number;
  timedOut?: boolean;
  url?: string;
  visitedCount?: number;
};

export type RestaurantDescriptionDiagnosticEvent = {
  phase: string;
} & RestaurantDescriptionDiagnostics;

export type RestaurantDescriptionDiagnosticLogger = (event: RestaurantDescriptionDiagnosticEvent) => void;

type RestaurantDescriptionCandidate = {
  text: string;
  priority: number;
};

const MAX_OFFICIAL_DESCRIPTION_PAGES = 2;
const OFFICIAL_DESCRIPTION_PAGE_TIMEOUT_MS = 5000;
const OFFICIAL_DESCRIPTION_TOTAL_BUDGET_MS = 10000;

export async function loadRestaurantDescriptionFromOrigin(
  value: string,
  diagnostics?: RestaurantDescriptionDiagnosticLogger
): Promise<RestaurantDescriptionResult | null> {
  const startedAt = Date.now();
  let inputUrl: URL;

  try {
    inputUrl = new URL(value.trim());
  } catch {
    return null;
  }

  const urls = [normalizeOfficialDescriptionUrl(inputUrl)];
  const results: RestaurantDescriptionResult[] = [];
  const visited = new Set<string>();

  diagnostics?.({
    phase: "source_queue",
    durationMs: Date.now() - startedAt,
    inputUrl: inputUrl.toString(),
    visitedCount: visited.size,
    linkedUrlCount: urls.length
  });

  for (let index = 0; index < urls.length && visited.size < MAX_OFFICIAL_DESCRIPTION_PAGES; index += 1) {
    const budgetRemainingMs = OFFICIAL_DESCRIPTION_TOTAL_BUDGET_MS - (Date.now() - startedAt);

    if (budgetRemainingMs <= 0) {
      diagnostics?.({
        phase: "total_budget_exhausted",
        budgetRemainingMs: 0,
        durationMs: Date.now() - startedAt,
        visitedCount: visited.size
      });
      break;
    }

    const url = urls[index];

    if (!url || visited.has(url)) {
      continue;
    }

    visited.add(url);

    const page = await loadRestaurantDescriptionPage(
      url,
      inputUrl.origin,
      diagnostics,
      index + 1,
      Math.min(OFFICIAL_DESCRIPTION_PAGE_TIMEOUT_MS, budgetRemainingMs)
    );

    if (!page) {
      continue;
    }

    if (page.result) {
      results.push(page.result);
      break;
    }

    for (const linkedUrl of page.linkedUrls) {
      if (
        urls.length < MAX_OFFICIAL_DESCRIPTION_PAGES &&
        !visited.has(linkedUrl) &&
        !urls.includes(linkedUrl)
      ) {
        urls.push(linkedUrl);
        break;
      }
    }
  }

  const selected = pickBestRestaurantDescriptionResult(results);

  diagnostics?.({
    phase: "text_selection",
    durationMs: Date.now() - startedAt,
    resultCount: results.length,
    selectedTextLength: selected?.text.length ?? 0,
    sourceUrl: selected?.sourceUrl,
    visitedCount: visited.size
  });

  return selected;
}

export async function loadRestaurantDescriptionFromUrl(value: string): Promise<RestaurantDescriptionResult | null> {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  return (await loadRestaurantDescriptionPage(url.toString(), url.origin))?.result ?? null;
}

export function extractRestaurantDescriptionFromHtml(html: string): string | null {
  const candidates: RestaurantDescriptionCandidate[] = [
    ...extractStructuredTextCandidates(html).map((text) => ({ text, priority: 40 })),
    ...extractMetaDescriptionCandidates(html).map((text) => ({ text, priority: 10 }))
  ]
    .map((candidate) => ({
      ...candidate,
      text: cleanRestaurantText(candidate.text)
    }))
    .filter((candidate) => candidate.text.length > 0)
    .filter((candidate) => isAllowedRestaurantDescription(candidate.text));
  const uniqueCandidates = dedupeCandidatesByNormalizedText(candidates);

  return uniqueCandidates
    .sort((a, b) => scoreRestaurantDescriptionCandidate(b) - scoreRestaurantDescriptionCandidate(a))[0]
    ?.text ?? null;
}

async function loadRestaurantDescriptionPage(
  value: string,
  officialOrigin: string,
  diagnostics?: RestaurantDescriptionDiagnosticLogger,
  pageIndex?: number,
  timeoutMs = OFFICIAL_DESCRIPTION_PAGE_TIMEOUT_MS
): Promise<{ result: RestaurantDescriptionResult | null; linkedUrls: string[] } | null> {
  const pageStartedAt = Date.now();
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:" || url.origin !== officialOrigin) {
    return null;
  }

  try {
    const fetchStartedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    diagnostics?.({
      phase: "html_fetch_start",
      durationMs: 0,
      pageIndex,
      timeoutMs,
      url: url.toString()
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "GustaroAI/1.0 Restaurant Description Extractor",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3"
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timer));
    const fetchDurationMs = Date.now() - fetchStartedAt;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    diagnostics?.({
      phase: "html_fetch_done",
      contentLength: Number(response.headers.get("content-length") ?? "") || undefined,
      contentType,
      durationMs: fetchDurationMs,
      finalUrl: response.url,
      pageIndex,
      status: response.status,
      timeoutMs,
      url: url.toString()
    });

    if (!response.ok) {
      return null;
    }

    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return null;
    }

    const downloadStartedAt = Date.now();
    const html = await response.text();
    diagnostics?.({
      phase: "html_download",
      durationMs: Date.now() - downloadStartedAt,
      finalUrl: response.url,
      htmlLength: html.length,
      pageIndex,
      url: url.toString()
    });

    const sourceUrl = response.url || url.toString();
    const parseStartedAt = Date.now();
    const text = extractRestaurantDescriptionFromHtml(html);
    diagnostics?.({
      phase: "html_parse",
      durationMs: Date.now() - parseStartedAt,
      finalUrl: sourceUrl,
      pageIndex,
      selectedTextLength: text?.length ?? 0,
      textFound: Boolean(text),
      url: url.toString()
    });

    const linkParseStartedAt = Date.now();
    const linkedUrls = extractOfficialDescriptionLinks(html, sourceUrl, officialOrigin);
    diagnostics?.({
      phase: "link_parse",
      durationMs: Date.now() - linkParseStartedAt,
      finalUrl: sourceUrl,
      linkedUrlCount: linkedUrls.length,
      pageIndex,
      url: url.toString()
    });

    return {
      result: text
        ? {
            text,
            source: "official_website",
            sourceUrl
          }
        : null,
      linkedUrls
    };
  } catch (error) {
    diagnostics?.({
      phase: "html_fetch_error",
      durationMs: Date.now() - pageStartedAt,
      errorName: error instanceof Error ? error.name : typeof error,
      pageIndex,
      timedOut: error instanceof Error && error.name === "AbortError",
      timeoutMs,
      url: url.toString()
    });

    return null;
  }
}

function normalizeOfficialDescriptionUrl(inputUrl: URL) {
  const url = new URL(inputUrl.toString());
  url.hash = "";
  return url.toString();
}

function extractMetaDescriptionCandidates(html: string) {
  const candidates: string[] = [];
  const metaPattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(html)) !== null) {
    const tag = match[0];
    const name = getAttribute(tag, "name") ?? getAttribute(tag, "property");

    if (!name || !["description", "og:description", "twitter:description"].includes(name.toLowerCase())) {
      continue;
    }

    const content = getAttribute(tag, "content");

    if (content) {
      candidates.push(content);
    }
  }

  return candidates;
}

function extractStructuredTextCandidates(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");
  const candidates: string[] = [];

  for (const tagName of ["main", "article", "section"]) {
    const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(stripped)) !== null) {
      if (match[1]) {
        candidates.push(htmlToText(match[1]).slice(0, 900));
      }
    }
  }

  const paragraphPattern = /<(?:h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|p)>/gi;
  let paragraphMatch: RegExpExecArray | null;

  while ((paragraphMatch = paragraphPattern.exec(stripped)) !== null && candidates.length < 30) {
    if (paragraphMatch[1]) {
      candidates.push(htmlToText(paragraphMatch[1]));
    }
  }

  return candidates;
}

function extractOfficialDescriptionLinks(html: string, baseUrl: string, officialOrigin: string) {
  const urls: string[] = [];
  const linkPattern = /<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null && urls.length < MAX_OFFICIAL_DESCRIPTION_PAGES) {
    const href = decodeHtmlEntities(match[2] ?? "").trim();

    if (!href || /^(?:#|mailto:|tel:|javascript:)/i.test(href)) {
      continue;
    }

    try {
      const url = new URL(href, baseUrl);

      if (url.origin !== officialOrigin || url.protocol !== "http:" && url.protocol !== "https:") {
        continue;
      }

      url.hash = "";

      const label = cleanRestaurantText(htmlToText(match[3] ?? ""));
      const linkText = `${url.pathname} ${url.search} ${label}`;

      if (!isLikelyOfficialDescriptionLink(linkText)) {
        continue;
      }

      const normalized = url.toString();

      if (!urls.includes(normalized)) {
        urls.push(normalized);
      }
    } catch {
      // Ignore malformed links on the official page.
    }
  }

  return urls;
}

function isLikelyOfficialDescriptionLink(value: string) {
  const normalized = normalizeForMatching(value);

  if (!normalized) {
    return false;
  }

  if (hasAnyTerm(normalized, [
    "attachment",
    "comment",
    "datenschutz",
    "feed",
    "gallery",
    "impressum",
    "kontakt",
    "legal",
    "privacy",
    "reservation",
    "reservierung",
    "wp content",
    "wp json"
  ])) {
    return false;
  }

  return hasAnyTerm(normalized, [
    "about",
    "about us",
    "chi siamo",
    "cucina",
    "filosofia",
    "geschichte",
    "home",
    "homepage",
    "philosophy",
    "restaurant",
    "restaurant homepage",
    "ristorante",
    "storia",
    "ueber uns",
    "uber uns"
  ]);
}

function htmlToText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<\s*br\b[^>]*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function getAttribute(tag: string, attributeName: string) {
  const pattern = new RegExp(`\\b${attributeName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return tag.match(pattern)?.[2];
}

function cleanRestaurantText(value: string) {
  const cleaned = decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/\b(?:prenota|chiama|book now|reserve|reservieren)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return selectRestaurantDescriptionSentences(removeLeadingHeadline(cleaned));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&auml;/gi, "ae")
    .replace(/&ouml;/gi, "oe")
    .replace(/&uuml;/gi, "ue")
    .replace(/&Auml;/gi, "Ae")
    .replace(/&Ouml;/gi, "Oe")
    .replace(/&Uuml;/gi, "Ue")
    .replace(/&szlig;/gi, "ss");
}

function isAllowedRestaurantDescription(value: string) {
  const normalized = normalizeForMatching(value);
  const wordCount = normalized.split(" ").filter(Boolean).length;

  if (value.length < 40 || value.length > 900 || wordCount < 7) {
    return false;
  }

  if (/[€$£]\s?\d|\d{1,3}[,.]\d{2}/.test(value)) {
    return false;
  }

  if (/@/.test(value) || /\b\d{4,5}\b/.test(value) || /\b(?:tel|telefon|phone|fax)\b/i.test(value)) {
    return false;
  }

  if (/\b(?:strasse|str\.|street|allee|platz|weg|road|via)\b.*\d/i.test(normalized)) {
    return false;
  }

  if (hasAnyTerm(normalized, [
    "adresse",
    "bestell",
    "cart",
    "cookie",
    "datenschutz",
    "delivery",
    "footer",
    "impressum",
    "kontakt",
    "liefer",
    "navigation",
    "oeffnungszeiten",
    "opening hours",
    "privacy",
    "reserv",
    "warenkorb"
  ])) {
    return false;
  }

  return hasAnyTerm(normalized, [
    "cucina",
    "cuisine",
    "familiare",
    "family",
    "familie",
    "historic",
    "storico",
    "kueche",
    "located",
    "materie prime",
    "mediterran",
    "mediterranean",
    "osteria",
    "piatti",
    "restaurant",
    "ristorante",
    "sapori",
    "situato",
    "tradizione",
    "tradition",
    "trattoria"
  ]);
}

function scoreRestaurantDescriptionCandidate(candidate: RestaurantDescriptionCandidate) {
  const normalized = normalizeForMatching(candidate.text);
  const wordCount = normalized.split(" ").filter(Boolean).length;
  const sentenceCount = countSentences(candidate.text);
  let score = candidate.priority + Math.min(wordCount, 90);

  if (sentenceCount >= 2) {
    score += 30;
  }

  if (hasAnyTerm(normalized, ["cucina", "kueche", "tradizione", "tradition", "storico", "mediterran", "materie prime"])) {
    score += 20;
  }

  return score;
}

function removeLeadingHeadline(value: string) {
  return value
    .replace(/^[^\p{Ll}]{20,}\s+(?=\p{Lu}\p{Ll})/u, "")
    .replace(/^[A-Z0-9\s'"&.,:-]{20,}\s+(?=Il Ristorante\b)/, "")
    .replace(/^[A-Z0-9\s'"&.,:-]{20,}\s+(?=Il Pozzetto\b)/, "")
    .replace(/^[A-Z0-9\s'"&.,:-]{20,}\s+(?=Das Il Pozzetto\b)/, "")
    .replace(/^[A-Z0-9\s'"&.,:-]{20,}\s+(?=Das Restaurant\b)/, "")
    .replace(/^[A-Z0-9\s'"&.,:-]{20,}\s+(?=The Restaurant\b)/, "")
    .trim();
}

function selectRestaurantDescriptionSentences(value: string) {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length < 2) {
    return value;
  }

  const selected = sentences
    .filter((sentence) => !isRestaurantDescriptionSentenceNoise(sentence))
    .slice(0, 3);

  return selected.length >= 2 ? selected.join(" ") : value;
}

function isRestaurantDescriptionSentenceNoise(value: string) {
  const normalized = normalizeForMatching(value);

  return hasAnyTerm(normalized, [
    "gruppe",
    "gruppen",
    "gruppi",
    "menu",
    "menue",
    "menu particolari",
    "prezzo",
    "preis",
    "qualita prezzo",
    "qualitaet preis",
    "request",
    "richieste",
    "senza eguali",
    "soddisfare",
    "speisekarte",
    "service",
    "servizio"
  ]);
}

function countSentences(value: string) {
  return value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.split(/\s+/).filter(Boolean).length >= 4)
    .length;
}

function hasAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function pickBestRestaurantDescriptionResult(results: RestaurantDescriptionResult[]) {
  return results
    .filter((result) => isAllowedRestaurantDescription(result.text))
    .sort((a, b) =>
      scoreRestaurantDescriptionCandidate({ text: b.text, priority: 0 }) -
      scoreRestaurantDescriptionCandidate({ text: a.text, priority: 0 })
    )[0] ?? null;
}

function dedupeCandidatesByNormalizedText(values: RestaurantDescriptionCandidate[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = normalizeForMatching(value.text);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeForMatching(value: string) {
  return value
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
