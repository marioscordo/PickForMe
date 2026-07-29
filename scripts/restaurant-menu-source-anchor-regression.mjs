import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const menuSourceSelector = read("apps/api/src/restaurant/selectRestaurantMenuSource.ts");
const discoveryService = read("apps/api/src/restaurant/discoverRestaurantSource.ts");

// Fallanalyse "sonnenalm.de" (Juli 2026): Ein leerer Seiten-Anker
// (href="#", meist ein reiner JS-UI-Umschalter wie ein mobiles Menue-
// Toggle) wurde in buildOfficialLinkCandidate() faelschlich NICHT als
// Anker erkannt (getUrlHash() liefert fuer ein bloses "#" einen leeren
// String, der als falsy durchfiel) und konkurrierte dadurch ueber den
// laxeren Fallback-Score gegen die echte Speisekarten-Seite - und gewann,
// weil "Menü" durch Doppelzaehlung ("menue" + enthaltenes "menu") hoeher
// bewertet wurde als "Speisekarte".
assert(
  menuSourceSelector.includes('const isAnchor = link.url.includes("#");'),
  "buildOfficialLinkCandidate must treat any URL containing '#' (including an empty fragment) as a same-page anchor, not a distinct linked page"
);
assert(
  !menuSourceSelector.includes("const isAnchor = Boolean(getUrlHash(link.url));"),
  "the old buggy anchor check (empty fragment treated as no anchor) must not come back"
);

// Verhaltenstest: dieselbe Bewertungslogik wie in selectRestaurantMenuSource.ts
// nachgebildet (die Funktionen sind nicht exportiert), gegen die echten
// Kandidaten von sonnenalm.de/de/ (per web_fetch am 2026-07-29 verifiziert).
function normalizeMenuText(value) {
  return decodeSafely(value)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function decodeSafely(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const REGULAR_MENU_TERMS = ["speisekarte", "restaurantkarte", "menu", "menue", "food menu", "main menu", "restaurant menu", "carte", "carta", "a la carte", "ristorante", "restaurante"];
const STRONG_MENU_TERMS = ["speisekarte", "restaurantkarte", "food menu", "main menu", "restaurant menu", "menu completo", "complete menu", "a la carte", "menue", "menu", "carta", "carte"];
const EXCLUDED_MENU_TERMS = ["fruehstueck", "fruhstuck", "breakfast", "brunch", "colazione", "tageskarte", "wochenkarte", "sonntagskarte", "aktionskarte", "saisonkarte", "getraenkekarte", "getrankekarte", "drinks", "beverages", "weinkarte", "wine", "vini", "cocktail", "bar", "dessertkarte", "dessert", "eventkarte", "cateringkarte"];

function hasRegularMenuTerm(value) {
  const normalized = normalizeMenuText(value);
  return REGULAR_MENU_TERMS.some((term) => normalized.includes(term));
}
function hasStrongMenuTerm(value) {
  const normalized = normalizeMenuText(value);
  return STRONG_MENU_TERMS.some((term) => normalized.includes(term));
}
function hasExcludedMenuTerm(value) {
  const normalized = normalizeMenuText(value);
  return EXCLUDED_MENU_TERMS.some((term) => normalized.includes(term));
}
function looksLikePdfUrl(value) {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}
function scoreMenuSignal(value) {
  const normalized = normalizeMenuText(value);
  let score = 0;
  if (normalized.includes("speisekarte")) score += 60;
  if (normalized.includes("restaurantkarte")) score += 48;
  if (normalized.includes("food menu")) score += 45;
  if (normalized.includes("main menu")) score += 44;
  if (normalized.includes("menu completo")) score += 44;
  if (normalized.includes("complete menu")) score += 44;
  if (normalized.includes("a la carte")) score += 38;
  if (normalized.includes("menue")) score += 34;
  if (normalized.includes("menu")) score += 30;
  if (normalized.includes("carta")) score += 26;
  if (normalized.includes("carte")) score += 22;
  if (looksLikePdfUrl(value)) score += 8;
  if (hasExcludedMenuTerm(normalized)) score -= 120;
  return score;
}

// Vereinfachte Nachbildung von buildOfficialLinkCandidate() nach dem Fix:
// isAnchor jetzt ueber "#".includes statt Boolean(getUrlHash(...)).
function evaluateLinkCandidate(url, label) {
  const probe = `${url} ${label}`;
  const isPdf = looksLikePdfUrl(url);
  const isAnchor = url.includes("#");

  if (hasExcludedMenuTerm(probe)) return null;
  if (!isPdf && isAnchor) return null;
  if (!hasRegularMenuTerm(probe) && !isPdf) return null;
  if (!hasStrongMenuTerm(probe)) return null;

  return { url, score: 690 + scoreMenuSignal(probe) };
}

const emptyAnchorCandidate = evaluateLinkCandidate("https://sonnenalm.de/de/#", "Menü Menü");
const realMenuCandidate = evaluateLinkCandidate("https://sonnenalm.de/de/berggasthof/speisekarte/", "Speisekarte");

assert(emptyAnchorCandidate === null, "an empty-fragment toggle link ('#') must be excluded as a candidate after the fix, not merely re-scored");
assert(realMenuCandidate !== null && realMenuCandidate.score === 750, "the real menu page must still be accepted with the expected fallback score");

// Timeout-Fix im Kontaktseiten-Fallback (contentMatchesRestaurant /
// contactPageMatchesCity in discoverRestaurantSource.ts): ohne Timeout kann
// eine langsame Kontaktseite die ganze Kandidaten-Pruefung verzoegern.
// Praxis-Symptom (28.07.2026): ein zuvor funktionierendes Restaurant
// scheiterte einmalig und lief beim naechsten Versuch wieder durch -
// typisch fuer eine haengende Anfrage ohne Timeout.
assert(
  discoveryService.includes("CONTACT_PAGE_FETCH_TIMEOUT_MS"),
  "contactPageMatchesCity's fetch calls must be bounded by an explicit timeout"
);
assert(
  /contactPageMatchesCity[\s\S]*?new AbortController\(\)[\s\S]*?signal: controller\.signal/.test(discoveryService),
  "contactPageMatchesCity must actually pass the AbortController signal into its fetch calls, not just declare a timeout constant"
);

console.log("restaurant menu source anchor regression passed");
