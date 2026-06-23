const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer) => Promise<{ text: string }>;

export function looksLikeUrl(value: string) {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function loadMenuTextFromUrl(urlText: string): Promise<string> {
  const url = new URL(urlText.trim());

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Nur http- und https-Links werden unterstützt.");
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "PickForMe/1.0 Menu Reader",
      Accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5"
    }
  });

  if (!response.ok) {
    throw new Error(`Speisekarten-Link konnte nicht geladen werden: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const looksLikePdf = contentType.includes("application/pdf") || url.pathname.toLowerCase().endsWith(".pdf");

  if (looksLikePdf) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = await pdfParse(buffer);

    return normalizeExtractedText(parsed.text);
  }

  const raw = await response.text();
  return htmlToReadableText(raw);
}

function htmlToReadableText(input: string) {
  return normalizeExtractedText(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|td|th|h1|h2|h3|h4|section|article)>/gi, "\n")
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
  );
}

function normalizeExtractedText(input: string) {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 24000);
}
