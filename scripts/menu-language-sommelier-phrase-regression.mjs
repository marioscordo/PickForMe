import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Fallanalyse Aug 2026 (Mario): sommelierPhrase wurde bisher in der
// GUI-/Ausgabesprache des Nutzers formuliert (targetLocale). Das nuetzt dem
// Nutzer wenig, wenn das Restaurantpersonal vor Ort eine andere Sprache
// spricht (z. B. deutscher Nutzer in einem russischen Restaurant). Fix:
// sommelierPhrase wird jetzt in der Sprache der Original-Speisekarte
// (menuLanguage) formuliert, unabhaengig von targetLocale. menuLanguage ist
// bereits ein von der Hauptgericht-Analyse geliefertes, geschlossenes Enum
// (MenuLanguageSchema) - dafuer ist keine zusaetzliche
// Sprachnamen-Zuordnungstabelle noetig, der ISO-Code wird direkt an die KI
// uebergeben. Bei "unknown"/fehlend faellt die Wahl auf Englisch zurueck,
// analog zu buildOrderLabelsForMenuLanguage() in analyze-menu/route.ts.

const recommendAi = fs
  .readFileSync("apps/api/src/ai/recommendWineForMainDishAI.ts", "utf8")
  .replace(/\r\n/g, "\n");
const wineRoute = fs
  .readFileSync("apps/api/app/api/wine-recommendation/route.ts", "utf8")
  .replace(/\r\n/g, "\n");
const mobileTypes = fs
  .readFileSync("apps/mobile/src/types/recommendations.ts", "utf8")
  .replace(/\r\n/g, "\n");
const pickformeApi = fs
  .readFileSync("apps/mobile/src/api/pickformeApi.ts", "utf8")
  .replace(/\r\n/g, "\n");
const recommendationCard = fs
  .readFileSync("apps/mobile/src/components/pick/RecommendationCard.tsx", "utf8")
  .replace(/\r\n/g, "\n");

// 1) Backend: recommendWineForMainDishAI nimmt menuLanguage entgegen und
// leitet daraus den ISO-Code fuer sommelierPhrase ab, getrennt von
// targetLanguage (das bleibt fuer title/wineStyle/reason/servingHint).
assert(
  recommendAi.includes("menuLanguage?: MenuLanguage;"),
  "recommendWineForMainDishAI must accept an optional menuLanguage parameter"
);
assert(
  recommendAi.includes("function resolveSommelierPhraseLanguageCode(menuLanguage: MenuLanguage | undefined) {") &&
    recommendAi.includes('return menuLanguage && menuLanguage !== "unknown" ? menuLanguage : "en";'),
  "sommelierPhrase language must fall back to English when menuLanguage is unknown or missing, not to the user's targetLocale"
);
assert(
  recommendAi.includes("const sommelierPhraseLanguageCode = resolveSommelierPhraseLanguageCode(menuLanguage);"),
  "the resolved sommelier phrase language code must be computed and passed into the prompt builder"
);
assert(
  /Sprache fuer das Feld sommelierPhrase: ISO-Sprachcode "\$\{sommelierPhraseLanguageCode\}"/.test(recommendAi),
  "the prompt must instruct the model to use the menu-language ISO code for sommelierPhrase, separate from the user's output language"
);
assert(
  recommendAi.includes("Sprache mit dem oben genannten ISO-Code fuer sommelierPhrase (Speisekarten-/Restaurantsprache, NICHT die Zielsprache der uebrigen Felder)"),
  "the sommelierPhrase rule must explicitly override the target-language instruction for this one field"
);

// 2) Keine hartcodierte Sprachnamen-Tabelle fuer menuLanguage noetig -
// getLanguageNameForLocale() wird nur noch fuer targetLanguage verwendet,
// nicht fuer sommelierPhraseLanguageCode.
assert(
  !/sommelierPhraseLanguageCode = getLanguageNameForLocale/.test(recommendAi),
  "sommelierPhraseLanguageCode must NOT go through the free-form locale name lookup table - the raw menuLanguage ISO code is passed directly to the model"
);

// 3) API-Route: menuLanguage wird aus dem Request-Body validiert
// (MenuLanguageSchema) und durchgereicht.
assert(
  wineRoute.includes("menuLanguage?: MenuLanguage;"),
  "wine-recommendation route request type must accept an optional menuLanguage field"
);
assert(
  wineRoute.includes("const menuLanguage = normalizeMenuLanguage(body.menuLanguage);") &&
    wineRoute.includes("menuLanguage\n      }),"),
  "wine-recommendation route must validate and pass menuLanguage into recommendWineForMainDishAI"
);
assert(
  wineRoute.includes("function normalizeMenuLanguage(value: unknown): MenuLanguage | undefined {") &&
    wineRoute.includes("MenuLanguageSchema.safeParse(value)"),
  "menuLanguage from the client must be validated against the closed MenuLanguageSchema enum, not trusted as free-form input"
);

// 4) Mobile: menuLanguage-Typ existiert und wird von der Analyse bis zum
// Wein-Request durchgereicht.
assert(
  mobileTypes.includes('export type MenuLanguage = "de" | "en" | "it" | "es" | "fr" | "id" | "ru" | "unknown";'),
  "mobile types must export a shared MenuLanguage type"
);
assert(
  pickformeApi.includes("menuLanguage?: MenuLanguage;"),
  "RequestWineRecommendationMobileArgs must accept menuLanguage"
);
assert(
  pickformeApi.includes("menuLanguage: args.menuLanguage") &&
    /requestWineRecommendation\(args: RequestWineRecommendationMobileArgs\) \{[\s\S]*?menuLanguage: args\.menuLanguage/.test(pickformeApi),
  "requestWineRecommendation must send menuLanguage in the request body"
);
assert(
  recommendationCard.includes("menuLanguage: result.menuLanguage,"),
  "RecommendationCard must pass the analyzed menu's language from the existing analyze result into the wine recommendation request"
);

// 5) Regressionsschutz: die bestehenden nutzerseitigen Felder
// (title/wineStyle/reason/servingHint) bleiben explizit an targetLanguage
// gebunden - nur sommelierPhrase wechselt die Sprachquelle.
assert(
  recommendAi.includes("Sprache fuer nutzerseitige Ausgaben (title/wineStyle/reason/servingHint): ${targetLanguage} (${targetLocale})."),
  "the other recommendation fields must remain in the user's own output language, unaffected by this change"
);

console.log("menu language sommelier phrase regression passed");
