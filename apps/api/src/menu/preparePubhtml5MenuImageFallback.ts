import sharp from "sharp";

// pubhtml5.com ("Flipbook"-Hosting) rendert PDF-Speisekarten als
// Umblaetter-Viewer. Die vom Server ausgelieferte HTML-Seite enthaelt ausser
// Meta-Tags keinen Text - die eigentlichen Seiten werden erst per
// JavaScript als einzelne, verschluesselt benannte WEBP-Bilder nachgeladen.
// Weder die bestehende HTML-Extraktion noch der Tilda-Bildfallback koennen
// diese Struktur erkennen. Verifiziert (Codereview Juli 2026) per echtem
// Netzwerkverkehr des Viewers: die Vollbild-Seiten liegen unter
// "files/large/<hash>.webp", wobei die Hashes aus "javascript/config.js"
// (Feld fliphtml5_pages[].n[0]) stammen. Diese Datei ist eine gueltige
// JSON-Struktur, die einer JS-Variable "htmlConfig" zugewiesen wird.
const PUBHTML5_HOSTS = new Set(["online.pubhtml5.com"]);
const MAX_PUBHTML5_MENU_PAGES = 10;
const MAX_PUBHTML5_MENU_IMAGE_WIDTH = 1280;

export type PreparedPubhtml5MenuImages = {
  imageDataUrls: string[];
  originalUrls: string[];
  bookBaseUrl: string;
  title: string | null;
  description: string | null;
  totalPageCount: number;
  usedPageCount: number;
  truncated: boolean;
};

export function isPubhtml5BookUrl(value: string): boolean {
  const parsed = safeParseUrl(value);

  if (!parsed) {
    return false;
  }

  // Erwartete Form: https://online.pubhtml5.com/<uLink>/<bLink>/...
  const segments = parsed.pathname.split("/").filter(Boolean);

  return PUBHTML5_HOSTS.has(parsed.hostname.toLowerCase()) && segments.length >= 2;
}

export async function preparePubhtml5MenuImages(value: string): Promise<PreparedPubhtml5MenuImages | null> {
  if (!isPubhtml5BookUrl(value)) {
    return null;
  }

  const parsed = safeParseUrl(value);

  if (!parsed) {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const bookBaseUrl = `${parsed.origin}/${segments[0]}/${segments[1]}/`;

  const config = await fetchPubhtml5Config(bookBaseUrl);

  if (!config) {
    logPubhtml5ImageFallback({ step: "config_missing", bookBaseUrl });
    return null;
  }

  const pageHashes = extractPageHashes(config);

  if (pageHashes.length === 0) {
    logPubhtml5ImageFallback({ step: "no_pages", bookBaseUrl });
    return null;
  }

  const totalPageCount = typeof config?.meta?.pageCount === "number" ? config.meta.pageCount : pageHashes.length;
  const truncated = pageHashes.length > MAX_PUBHTML5_MENU_PAGES;
  const usedHashes = pageHashes.slice(0, MAX_PUBHTML5_MENU_PAGES);

  const imageDataUrls: string[] = [];
  const originalUrls: string[] = [];

  for (const hash of usedHashes) {
    const imageUrl = `${bookBaseUrl}files/large/${hash}`;
    const prepared = await preparePubhtml5MenuPageImage(imageUrl);

    if (prepared) {
      imageDataUrls.push(prepared);
      originalUrls.push(imageUrl);
    }
  }

  if (imageDataUrls.length === 0) {
    logPubhtml5ImageFallback({ step: "no_images_downloaded", bookBaseUrl, candidateCount: usedHashes.length });
    return null;
  }

  logPubhtml5ImageFallback({
    step: "selected",
    bookBaseUrl,
    totalPageCount,
    usedPageCount: imageDataUrls.length,
    truncated
  });

  return {
    imageDataUrls,
    originalUrls,
    bookBaseUrl,
    title: typeof config?.meta?.title === "string" ? config.meta.title : null,
    description: typeof config?.meta?.description === "string" ? config.meta.description : null,
    totalPageCount,
    usedPageCount: imageDataUrls.length,
    truncated
  };
}

async function fetchPubhtml5Config(bookBaseUrl: string): Promise<any | null> {
  try {
    const response = await fetchWithTimeout(`${bookBaseUrl}javascript/config.js`, 8000);

    if (!response.ok) {
      return null;
    }

    const body = await response.text();
    const match = body.match(/var\s+htmlConfig\s*=\s*(\{[\s\S]*\});/);

    if (!match?.[1]) {
      return null;
    }

    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractPageHashes(config: any): string[] {
  const pages = Array.isArray(config?.fliphtml5_pages) ? config.fliphtml5_pages : [];
  const hashes: string[] = [];

  for (const page of pages) {
    const hash = Array.isArray(page?.n) ? page.n[0] : undefined;

    if (typeof hash === "string" && hash.trim().length > 0) {
      hashes.push(hash.trim());
    }
  }

  return hashes;
}

async function preparePubhtml5MenuPageImage(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(imageUrl, 8000);

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("image/")) {
      return null;
    }

    const originalBuffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(originalBuffer).metadata();
    const width = metadata.width ?? 0;

    if (width <= 0) {
      return null;
    }

    const resizedBuffer = await sharp(originalBuffer)
      .resize({
        width: Math.min(width, MAX_PUBHTML5_MENU_IMAGE_WIDTH),
        withoutEnlargement: true
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${resizedBuffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function logPubhtml5ImageFallback(fields: Record<string, string | number | boolean | undefined>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_PUBHTML5_IMAGE_FALLBACK] ${payload}`);
}

async function fetchWithTimeout(value: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      redirect: "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
