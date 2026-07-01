export type RestaurantDescriptionResult = {
  text: string;
  source: "official_website";
  sourceUrl: string;
};

export async function loadRestaurantDescriptionFromOrigin(value: string): Promise<RestaurantDescriptionResult | null> {
  try {
    const inputUrl = new URL(value.trim());
    return loadRestaurantDescriptionFromUrl(`${inputUrl.origin}/`);
  } catch {
    return null;
  }
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

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "PickForMe/1.0 Restaurant Description Extractor",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3"
      }
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return null;
    }

    const text = extractRestaurantDescriptionFromHtml(await response.text());

    return text
      ? {
          text,
          source: "official_website",
          sourceUrl: response.url || url.toString()
        }
      : null;
  } catch {
    return null;
  }
}

export function extractRestaurantDescriptionFromHtml(html: string): string | null {
  const candidates = [
    ...extractMetaDescriptionCandidates(html),
    ...extractStructuredTextCandidates(html)
  ]
    .map(cleanRestaurantText)
    .filter(Boolean)
    .filter(isAllowedRestaurantDescription);
  const uniqueCandidates = dedupeByNormalizedText(candidates);

  return uniqueCandidates[0] ?? null;
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
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    "menu",
    "menue",
    "navigation",
    "oeffnungszeiten",
    "opening hours",
    "privacy",
    "reserv",
    "speisekarte",
    "warenkorb"
  ])) {
    return false;
  }

  return hasAnyTerm(normalized, [
    "cucina",
    "cuisine",
    "family",
    "familie",
    "historic",
    "kueche",
    "located",
    "mediterran",
    "mediterranean",
    "osteria",
    "restaurant",
    "ristorante",
    "situato",
    "tradition",
    "trattoria"
  ]);
}

function hasAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function dedupeByNormalizedText(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = normalizeForMatching(value);

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
