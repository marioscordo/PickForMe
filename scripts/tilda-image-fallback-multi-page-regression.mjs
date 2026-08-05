import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Fallanalyse "hacha.ru/theater" (Juli 2026): Tilda rendert eine
// hochgeladene PDF-Speisekarte oft als mehrseitige Bilderserie
// (___page-0001.jpg, ___page-0002.jpg - bestaetigt per Live-Abruf: der
// og:image-Meta-Tag der Seite zeigt auf ___page-0001.jpg). Die fruehere
// Fassung von prepareBestTildaMenuImageFallback() waehlte per Rank-Score
// (Aufloesung x Dateigroesse) genau EIN Bild aus und verwarf den Rest -
// im echten Log wurden 2 Kandidaten gefunden, aber nur 1 an die KI
// gesendet, die daraufhin nur 1 Gericht empfahl (die KI sah nur die
// Haelfte der Karte).

const fallback = fs
  .readFileSync("apps/api/src/menu/prepareTildaMenuImageFallback.ts", "utf8")
  .replace(/\r\n/g, "\n");
const route = fs
  .readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8")
  .replace(/\r\n/g, "\n");

assert(
  fallback.includes("export type PreparedTildaMenuImages = {") &&
    fallback.includes("imageDataUrls: string[];") &&
    fallback.includes("originalUrls: string[];"),
  "the Tilda fallback must return a plural, multi-image shape instead of a single best image"
);
assert(
  !fallback.includes("candidates.sort((left, right) => right.rankScore - left.rankScore)[0] ?? null"),
  "the old single-best-candidate selection must be removed"
);
assert(
  fallback.includes("return {\n    imageDataUrls: rankedCandidates.map((candidate) => candidate.imageDataUrl),\n    originalUrls: rankedCandidates.map((candidate) => candidate.originalUrl)\n  };"),
  "prepareBestTildaMenuImageFallback must return ALL prepared candidates, not just the top-ranked one"
);

assert(
  route.includes("urls: tildaImage.imageDataUrls,") && route.includes("sourceUrl: tildaImage.originalUrls[0] ?? rawMenuText,"),
  "route.ts must pass all Tilda candidate images to the AI, not a single imageDataUrl"
);
assert(
  !route.includes("urls: [tildaImage.imageDataUrl],"),
  "the old single-image array wrapping must be gone from route.ts"
);

// responseMode bleibt unveraendert. Das Timeout-Budget wurde in einem
// separaten, spaeteren Fix bewusst von 60000ms auf
// MULTI_IMAGE_FALLBACK_AI_TIMEOUT_MS (90000ms) angehoben, weil dieser Zweig
// jetzt mehrere volle Bilder verarbeitet - siehe
// multi-image-timeout-and-loading-ux-regression.mjs fuer die Timeout-Pruefung.
assert(
  /prepareBestTildaMenuImageFallback[\s\S]*responseMode: "ai_image"/.test(route),
  "Tilda image fallback must keep the existing ai_image responseMode"
);

console.log("tilda image fallback multi-page regression passed");
