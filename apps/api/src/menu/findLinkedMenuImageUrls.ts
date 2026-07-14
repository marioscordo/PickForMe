const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const SUPPORTED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]);

export function looksLikeImageUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}

export async function findLinkedMenuImageUrls(value: string, maxResults = 8): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(value, 8000);

    if (!response.ok) {
      return [];
    }

    const finalUrl = response.url || value;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (isSupportedImageContentType(contentType)) {
      return [finalUrl];
    }

    if (contentType.startsWith("image/")) {
      return [];
    }

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return [];
    }

    const html = await response.text();
    const candidates = extractImageCandidates(html, finalUrl)
      .filter((candidate) => scoreImageCandidate(candidate) > 0)
      .sort((a, b) => scoreImageCandidate(b) - scoreImageCandidate(a));

    return filterValidImageUrls(dedupeSimilarImageUrls(candidates), maxResults);
  } catch {
    return [];
  }
}

export async function findTildaMenuImageUrls(value: string, maxResults = 2): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(value, 8000);

    if (!response.ok) {
      return [];
    }

    const finalUrl = response.url || value;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return [];
    }

    const html = await response.text();
    const candidates = extractTildaMenuImageCandidates(html, finalUrl);

    return filterValidImageUrls(dedupeSimilarImageUrls(candidates), maxResults);
  } catch {
    return [];
  }
}

async function filterValidImageUrls(values: string[], maxResults: number): Promise<string[]> {
  const result: string[] = [];

  for (const value of values) {
    if (result.length >= maxResults) {
      break;
    }

    if (await isValidImageUrl(value)) {
      result.push(value);
    }
  }

  return result;
}

async function isValidImageUrl(value: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(value, 8000, "HEAD");

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (isSupportedImageContentType(contentType)) {
      return true;
    }

    if (contentType) {
      return false;
    }

    return looksLikeImageUrl(response.url || value);
  } catch {
    return false;
  }
}

function isSupportedImageContentType(value: string): boolean {
  return SUPPORTED_IMAGE_CONTENT_TYPES.has(value.split(";")[0]?.trim() ?? "");
}

function extractImageCandidates(html: string, baseUrl: string): string[] {
  const candidates = new Set<string>();
  const attributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  const cssUrlPattern = /url\(["']?([^"')]+)["']?\)/gi;

  collectCandidates(html, baseUrl, attributePattern, candidates);
  collectCandidates(html, baseUrl, cssUrlPattern, candidates);

  return [...candidates];
}

function extractTildaMenuImageCandidates(html: string, baseUrl: string): string[] {
  const candidates: Array<{ url: string; score: number; index: number }> = [];
  const attributePattern = /\b(?:data-original|data-img-zoom-url)=["']([^"']+)["']/gi;
  const metaImagePattern = /<meta\b(?=[^>]*\bitemprop=["']image["'])(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*>/gi;

  collectTildaMenuCandidates(html, baseUrl, attributePattern, candidates);
  collectTildaMenuCandidates(html, baseUrl, metaImagePattern, candidates);

  return candidates
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((candidate) => candidate.url);
}

function collectTildaMenuCandidates(
  html: string,
  baseUrl: string,
  pattern: RegExp,
  candidates: Array<{ url: string; score: number; index: number }>
) {
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const rawValue = decodeHtmlAttribute(match[1] ?? "");

    if (!looksLikeTildaOriginalImage(rawValue)) {
      continue;
    }

    const context = html.slice(Math.max(0, match.index - 2400), Math.min(html.length, match.index + 800));
    const contextScore = scoreTildaMenuImageContext(context);

    if (contextScore <= 0) {
      continue;
    }

    try {
      candidates.push({
        url: new URL(rawValue, baseUrl).toString(),
        score: contextScore,
        index: match.index
      });
    } catch {
      // ignored
    }
  }
}

function collectCandidates(html: string, baseUrl: string, pattern: RegExp, candidates: Set<string>) {
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const rawValue = decodeHtmlAttribute(match[1] ?? "");
    const normalized = rawValue.toLowerCase();

    if (!IMAGE_EXTENSIONS.some((extension) => normalized.includes(extension))) {
      continue;
    }

    try {
      candidates.add(new URL(rawValue, baseUrl).toString());
    } catch {
      // ignored
    }
  }
}

function looksLikeTildaOriginalImage(value: string): boolean {
  const normalized = value.toLowerCase();

  if (!IMAGE_EXTENSIONS.some((extension) => normalized.includes(extension))) {
    return false;
  }

  if (!normalized.includes("static.tildacdn.com/")) {
    return false;
  }

  if (
    normalized.includes("/-/resize") ||
    normalized.includes("/-/empty/") ||
    normalized.includes("logo") ||
    normalized.includes("favicon") ||
    normalized.includes("blank") ||
    normalized.includes("icon") ||
    normalized.includes("vk.com") ||
    normalized.includes("facebook") ||
    normalized.includes("instagram") ||
    normalized.includes("hero") ||
    normalized.includes("cover") ||
    normalized.includes("promo")
  ) {
    return false;
  }

  return true;
}

function scoreTildaMenuImageContext(value: string): number {
  const normalized = value
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  let score = 0;

  if (normalized.includes("меню")) score += 8;
  if (normalized.includes("menu")) score += 6;
  if (normalized.includes("speisekarte")) score += 6;
  if (normalized.includes("restaurant")) score += 2;
  if (normalized.includes("t552")) score += 2;
  if (normalized.includes("imageobject")) score += 1;
  if (normalized.includes("gallery")) score -= 2;
  if (normalized.includes("slider")) score -= 3;
  if (normalized.includes("logo")) score -= 8;
  if (normalized.includes("favicon")) score -= 8;
  if (normalized.includes("hero")) score -= 5;
  if (normalized.includes("cover")) score -= 4;
  if (normalized.includes("promo")) score -= 4;

  return score;
}

function scoreImageCandidate(value: string): number {
  const normalized = decodeURIComponent(value.toLowerCase());
  let score = 0;

  if (normalized.includes("speisekarte")) score += 8;
  if (normalized.includes("speise")) score += 6;
  if (normalized.includes("menu")) score += 5;
  if (normalized.includes("menue")) score += 5;
  if (normalized.includes("menü")) score += 5;
  if (normalized.includes("food")) score += 5;
  if (normalized.includes("essen")) score += 5;

  if (normalized.includes("suppen")) score += 4;
  if (normalized.includes("vorspeise")) score += 4;
  if (normalized.includes("salat")) score += 4;
  if (normalized.includes("gefluegel")) score += 4;
  if (normalized.includes("geflügel")) score += 4;
  if (normalized.includes("schwein")) score += 4;
  if (normalized.includes("rind")) score += 4;
  if (normalized.includes("steak")) score += 4;
  if (normalized.includes("bayrisch")) score += 4;
  if (normalized.includes("bayerisch")) score += 4;
  if (normalized.includes("fisch")) score += 4;
  if (normalized.includes("dessert")) score += 3;

  if (normalized.includes("weinkarte")) score -= 10;
  if (normalized.includes("wine")) score -= 10;
  if (normalized.includes("getraenk")) score -= 10;
  if (normalized.includes("getränk")) score -= 10;
  if (normalized.includes("drinks")) score -= 10;
  if (normalized.includes("cocktail")) score -= 10;

  if (normalized.includes("logo")) score -= 8;
  if (normalized.includes("favicon")) score -= 8;
  if (normalized.includes("blank")) score -= 8;
  if (normalized.includes("background")) score -= 6;
  if (normalized.includes("header")) score -= 6;
  if (normalized.includes("slideshow")) score -= 6;
  if (normalized.includes("bottom")) score -= 6;
  if (normalized.match(/_w\d+_h\d+/)) score -= 2;

  return score;
}

function dedupeSimilarImageUrls(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value
      .toLowerCase()
      .replace(/_w\d+_h\d+(?=\.(png|jpg|jpeg|webp))/i, "")
      .replace(/[-_]\d+x\d+(?=\.(png|jpg|jpeg|webp))/i, "");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .trim();
}

async function fetchWithTimeout(value: string, timeoutMs: number, method: "GET" | "HEAD" = "GET"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      redirect: "follow",
      method,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
