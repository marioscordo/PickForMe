import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Produktidee Juli 2026: die allgemeine, menuekartenunabhaengige
// Wein-Stil-Empfehlung bekommt ein zusaetzliches Feld "sommelierPhrase" -
// ein fertig aussprechbarer Bestellsatz fuer Kellner/Sommelier, der bei
// JEDEM Restaurant funktioniert (im Gegensatz zur konkreten Weinauswahl aus
// der Karte, die eine auswertbare Weinliste voraussetzt und bei vielen
// gehobenen Restaurants mit separater Weinkarte nicht greift). Bewusst als
// zusaetzliches, optionales Feld umgesetzt ("Ergaenzen", nicht "Ersetzen") -
// bestehende Konsumenten des WineRecommendation-Typs bleiben unveraendert
// funktionsfaehig, auch wenn das Feld einmal fehlt.

const recommendAi = fs
  .readFileSync("apps/api/src/ai/recommendWineForMainDishAI.ts", "utf8")
  .replace(/\r\n/g, "\n");
const mobileTypes = fs
  .readFileSync("apps/mobile/src/types/recommendations.ts", "utf8")
  .replace(/\r\n/g, "\n");
const recommendationCard = fs
  .readFileSync("apps/mobile/src/components/pick/RecommendationCard.tsx", "utf8")
  .replace(/\r\n/g, "\n");
const deDE = fs.readFileSync("apps/mobile/src/content/mobileContent.de-DE.json", "utf8");
const enUS = fs.readFileSync("apps/mobile/src/content/mobileContent.en-US.json", "utf8");

// 1) API-Typ und Parsing
assert(
  recommendAi.includes("sommelierPhrase?: string | null;"),
  "WineRecommendation type must declare the new optional sommelierPhrase field"
);
assert(
  recommendAi.includes("sommelierPhrase: stringField(recommendation.sommelierPhrase) || null,"),
  "recommendWineForMainDishAI must parse sommelierPhrase from the AI response"
);

// 2) Das Feld darf NICHT zu den Pflichtfeldern gehoeren, die eine gesamte
// Empfehlung auf null setzen, wenn sie fehlen - sonst waere das Feature ein
// Regressionsrisiko fuer die bestehende, bereits funktionierende
// Stil-Empfehlung statt einer reinen Ergaenzung.
assert(
  !/if \(!title \|\| !wineStyle \|\| !reason \|\| !isWineConfidence\(confidence\) \|\| !.*sommelierPhrase/.test(recommendAi),
  "sommelierPhrase must stay optional and must not gate the whole recommendation to null when missing"
);

// 3) Prompt muss das neue Feld erklaeren und die Karten-Unabhaengigkeit
// explizit festschreiben.
assert(
  recommendAi.includes("sommelierPhrase muss unabhaengig von einem bestimmten Restaurant formulierbar sein und darf keine Speisekartenfakten voraussetzen."),
  "prompt must explicitly require the phrase to be menu-independent"
);
assert(
  recommendAi.includes('"sommelierPhrase": "fertig aussprechbarer Bestellsatz fuer Kellner/Sommelier in der Sprache mit dem oben genannten ISO-Code fuer sommelierPhrase, nicht in der Zielsprache",'),
  "prompt output contract must include the new sommelierPhrase field"
);
// Sprachwahl-Update Aug 2026: sommelierPhrase-Text siehe
// menu-language-sommelier-phrase-regression.mjs (separates Skript fuer die
// menuLanguage-basierte Sprachwahl).

// 4) Mobile-Typ
assert(
  mobileTypes.includes("sommelierPhrase?: string | null;"),
  "mobile WineRecommendation type must declare the new optional sommelierPhrase field"
);

// 5) Mobile-Rendering: additiv, nur sichtbar wenn vorhanden, ersetzt nichts
// Bestehendes.
assert(
  recommendationCard.includes("{result.sommelierPhrase ? (") &&
    recommendationCard.includes("{content.recommendation.wineOrderPhraseLabel}") &&
    recommendationCard.includes("{result.sommelierPhrase}"),
  "RecommendationCard must render sommelierPhrase conditionally, as an addition alongside the existing wineStyle/reason/servingHint texts"
);
assert(
  recommendationCard.includes("<Text style={local.nestedResultName}>{result.wineStyle}</Text>") &&
    recommendationCard.includes("<Text style={local.nestedResultText}>{result.reason}</Text>"),
  "the existing wineStyle/reason rendering must remain unchanged (Ergaenzen, not Ersetzen)"
);

// 6) Content-Labels in beiden unterstuetzten Sprachen vorhanden.
assert(deDE.includes('"wineOrderPhraseLabel"'), "German content must define the new label");
assert(enUS.includes('"wineOrderPhraseLabel"'), "English content must define the new label");

console.log("wine sommelier phrase regression passed");
