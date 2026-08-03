import sharp from "sharp";
import { findTildaMenuImageUrls } from "./findLinkedMenuImageUrls";

const MAX_TILDA_MENU_IMAGE_WIDTH = 1280;
const MAX_TILDA_MENU_IMAGE_CANDIDATES = 6;

type PreparedTildaMenuImage = {
  imageDataUrl: string;
  originalUrl: string;
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
  originalBytes: number;
  resizedBytes: number;
};

type TildaMenuImageCandidate = PreparedTildaMenuImage & {
  rankScore: number;
};

// Fallanalyse "hacha.ru/theater", Juli 2026: Tilda rendert eine hochgeladene
// PDF-Speisekarte oft als mehrseitige Bilderserie (z.B. "___page-0001.jpg",
// "___page-0002.jpg"). Die fruehere Fassung dieser Funktion waehlte per
// rankScore (Aufloesung x Dateigroesse) genau EIN "bestes" Bild aus und
// verwarf alle anderen Seiten vollstaendig - bei hacha.ru wurden so 2
// gefundene Kandidaten auf 1 reduziert, die KI sah nur die Haelfte der
// Karte und empfahl entsprechend nur 1 Gericht. Analog zum generischen
// Bild-Fallback (prepareLinkedMenuImageFallback.ts, das seit der
// sonnenalm.de-Fallanalyse bewusst ALLE gefundenen Speisekarten-Bilder
// mitgibt) werden jetzt alle positiv bewerteten, vorbereiteten Kandidaten
// zurueckgegeben statt nur der eine mit dem hoechsten Rank-Score.
export type PreparedTildaMenuImages = {
  imageDataUrls: string[];
  originalUrls: string[];
};

export async function prepareBestTildaMenuImageFallback(value: string): Promise<PreparedTildaMenuImages | null> {
  const imageUrls = await findTildaMenuImageUrls(value, MAX_TILDA_MENU_IMAGE_CANDIDATES);

  if (imageUrls.length === 0) {
    logTildaImageFallback({
      candidateCount: 0,
      selected: false
    });
    return null;
  }

  const candidates: TildaMenuImageCandidate[] = [];

  for (const imageUrl of imageUrls) {
    const candidate = await prepareTildaMenuImageCandidate(imageUrl);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  const rankedCandidates = candidates.sort((left, right) => right.rankScore - left.rankScore);
  const best = rankedCandidates[0] ?? null;

  logTildaImageFallback({
    candidateCount: imageUrls.length,
    preparedCount: candidates.length,
    selected: rankedCandidates.length > 0,
    selectedCount: rankedCandidates.length,
    selectedUrl: best?.originalUrl,
    originalWidth: best?.originalWidth,
    originalHeight: best?.originalHeight,
    resizedWidth: best?.resizedWidth,
    resizedHeight: best?.resizedHeight,
    originalBytes: best?.originalBytes,
    resizedBytes: best?.resizedBytes,
    estimatedHighDetailTiles512: best ? estimateHighDetailTiles512(best.resizedWidth, best.resizedHeight) : undefined,
    readability: best ? "max_1280_menu_text_preserved" : undefined
  });

  if (rankedCandidates.length === 0) {
    return null;
  }

  return {
    imageDataUrls: rankedCandidates.map((candidate) => candidate.imageDataUrl),
    originalUrls: rankedCandidates.map((candidate) => candidate.originalUrl)
  };
}

async function prepareTildaMenuImageCandidate(imageUrl: string): Promise<TildaMenuImageCandidate | null> {
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
    const originalMetadata = await sharp(originalBuffer).metadata();
    const originalWidth = originalMetadata.width ?? 0;
    const originalHeight = originalMetadata.height ?? 0;

    if (originalWidth <= 0 || originalHeight <= 0) {
      return null;
    }

    const resizedBuffer = await sharp(originalBuffer)
      .resize({
        width: Math.min(originalWidth, MAX_TILDA_MENU_IMAGE_WIDTH),
        withoutEnlargement: true
      })
      .png()
      .toBuffer();
    const resizedMetadata = await sharp(resizedBuffer).metadata();
    const resizedWidth = resizedMetadata.width ?? originalWidth;
    const resizedHeight = resizedMetadata.height ?? originalHeight;

    return {
      imageDataUrl: `data:image/png;base64,${resizedBuffer.toString("base64")}`,
      originalUrl: imageUrl,
      originalWidth,
      originalHeight,
      resizedWidth,
      resizedHeight,
      originalBytes: originalBuffer.length,
      resizedBytes: resizedBuffer.length,
      rankScore: originalWidth * originalHeight + originalBuffer.length
    };
  } catch {
    return null;
  }
}

function estimateHighDetailTiles512(width: number, height: number) {
  return Math.ceil(width / 512) * Math.ceil(height / 512);
}

function logTildaImageFallback(fields: Record<string, string | number | boolean | undefined>) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_TILDA_IMAGE_FALLBACK] ${payload}`);
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
