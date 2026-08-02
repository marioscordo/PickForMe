import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Token-Optimierung Juli 2026: "Vorspeisen suchen" rief bisher IMMER die
// komplette /api/analyze-menu-Pipeline ein zweites Mal mit derselben Quelle
// auf (erneuter Fetch/Parse bei Text-/HTML-Speisekarten). Fix: die API gibt
// bei Text-/HTML-Quellen den bereits extrahierten Text zurueck
// (reusableMenuText), den der Mobile-Client bei der zweiten Analyse
// stattdessen sendet. PDF und Bild bleiben bewusst unveraendert - siehe
// Risikoanalyse (PDF: Extraktion liegt tief in der Pipeline; Bild: kein
// rollen-unabhaengiger Text-Zwischenschritt, Vorspeisen wuerden fehlen, da
// der erste "main"-Aufruf sie nie in die Kandidatenliste aufnimmt).

const route = fs
  .readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8")
  .replace(/\r\n/g, "\n");
const analyzeTypes = fs
  .readFileSync("apps/mobile/src/types/recommendations.ts", "utf8")
  .replace(/\r\n/g, "\n");
const recommendationCard = fs
  .readFileSync("apps/mobile/src/components/pick/RecommendationCard.tsx", "utf8")
  .replace(/\r\n/g, "\n");

// 1) API muss reusableMenuText NUR fuer sourceKind text/html setzen, aus
// source.text (das ist exakt das, was tatsaechlich an die Haupt-KI ging -
// kein PDF-Datei-Anhang, kein zwischengeschalteter Bild-Fallback).
assert(
  route.includes(
    'const reusableMenuText = (sourceKind === "text" || sourceKind === "html") && source.text\n    ? { reusableMenuText: source.text }\n    : {};'
  ),
  "API must gate reusableMenuText strictly to sourceKind text/html, sourced from source.text"
);
assert(
  route.includes("...reusableMenuText,") && route.includes("...extraPayload,"),
  "the response data object must spread reusableMenuText alongside the existing extraPayload, not replace it"
);

// 2) Es darf KEINE entsprechende Erweiterung fuer "pdf" oder "image" geben -
// das waere die genau ausgeschlossene, riskantere Aenderung.
assert(
  !route.includes('sourceKind === "pdf"') || !route.match(/sourceKind === "pdf"[\s\S]{0,80}reusableMenuText/),
  "reusableMenuText must not be wired up for PDF sources in this change"
);

// 3) Mobile-Typ muss das neue, optionale Feld kennen.
assert(
  analyzeTypes.includes("reusableMenuText?: string;"),
  "AnalyzeData must declare the new optional reusableMenuText field"
);

// 4) RecommendationCard muss bei der Vorspeisen-Suche reusableMenuText nur
// verwenden, wenn KEIN Bild-Quelle aktiv ist (menuImageSource) - sonst
// bleibt das bestehende, unveraenderte Verhalten (menuText) erhalten.
assert(
  recommendationCard.includes(
    "const nestedMenuText = !menuImageSource && result.reusableMenuText\n      ? result.reusableMenuText\n      : menuText;"
  ),
  "handleStartersAndSaladsSearch must only reuse text when there is no image source, falling back to the original menuText otherwise"
);
assert(
  recommendationCard.includes("menuText: nestedMenuText,") && recommendationCard.includes("menuImageSource,\n        onResponseStatus:"),
  "the starter-search analyzeMenu call must send nestedMenuText while keeping menuImageSource untouched"
);

console.log("starter search menu text reuse regression passed");
