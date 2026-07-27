import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function transpile(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true
    }
  }).outputText;
}

function loadMenuMarkersModule() {
  const sourcePath = path.resolve("apps/api/src/menu/menuMarkers.ts");
  const compiled = transpile(sourcePath);
  const module = { exports: {} };

  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require,
    process,
    console
  }, { filename: sourcePath });

  return module.exports;
}

// Codereview Juli 2026, Fallanalyse "60secondstonapoli.de": Speisekarten mit
// standortabhaengigen (also im Text fehlenden) Preisen fuehrten dazu, dass
// extractHtmlMenu.ts ganze Gerichtslisten (z.B. die komplette Pizzakarte)
// stillschweigend verwarf oder als Beschreibung des Nachbargerichts
// verschluckte. Dieser Test laedt das echte, unveraenderte Modul (per
// ts.transpileModule + vm, wie in den bestehenden *-regression.mjs-Skripten
// dieses Repos ueblich) und prueft das reale Extraktionsverhalten - keine
// Nachbildung der Logik, sondern der Originalcode.
function loadExtractHtmlMenuModule() {
  const sourcePath = path.resolve("apps/api/src/menu/extraction/extractHtmlMenu.ts");
  const compiled = transpile(sourcePath);
  const taxonomyPath = path.resolve("apps/api/src/menu/extraction/htmlCategoryTaxonomy.json");
  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
  const menuMarkers = loadMenuMarkersModule();
  const module = { exports: {} };

  const scopedRequire = (request) => {
    if (request.endsWith("../categoryRoleRules")) {
      // Nicht Teil des getesteten Pfads (extractHtmlMenuFromHtml ruft das
      // nicht auf) - Stub reicht, echte Kategorie-Rollenlogik hat ihren
      // eigenen Regressionstest an anderer Stelle.
      return { applyCategoryRoleMetadataToDish: (dish) => dish };
    }

    if (request.endsWith("../menuMarkers")) {
      return menuMarkers;
    }

    if (request.endsWith("./htmlCategoryTaxonomy.json")) {
      return taxonomy;
    }

    return require(request);
  };

  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: scopedRequire,
    process,
    console
  }, { filename: sourcePath });

  return module.exports;
}

// Struktur-Absicherung: Die Kernfixe duerfen nicht versehentlich entfernt
// werden (z.B. durch einen spaeteren, unabhaengigen Refactor).
const source = fs.readFileSync(
  path.resolve("apps/api/src/menu/extraction/extractHtmlMenu.ts"),
  "utf8"
).replace(/\r\n/g, "\n");

function extractBalancedBlock(value, startMarker) {
  const start = value.indexOf(startMarker);
  assert(start >= 0, `Missing start marker: ${startMarker}`);

  const braceStart = value.indexOf("{", start);
  assert(braceStart >= 0, `Missing opening brace for: ${startMarker}`);

  let depth = 0;

  for (let i = braceStart; i < value.length; i += 1) {
    if (value[i] === "{") depth += 1;
    if (value[i] === "}") {
      depth -= 1;

      if (depth === 0) {
        return value.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Unbalanced braces while extracting: ${startMarker}`);
}

const finishPendingWithoutPriceBody = extractBalancedBlock(source, "const finishPendingWithoutPrice = () => {");

assert(
  finishPendingWithoutPriceBody.includes("if (!pending.category)"),
  "price-less items must only be committed when a recognized category is present (avoids false positives from unclassifiable text)"
);
assert(
  !/price\s*:/.test(finishPendingWithoutPriceBody),
  "finishPendingWithoutPrice must never fabricate a price"
);
assert(
  (source.match(/finishPendingWithoutPrice\(\)/g) ?? []).length >= 5,
  "finishPendingWithoutPrice must be wired into all pending-reset branches (weekday heading, category line, numbered title, new-title-in-pending, EOF)"
);
assert(
  source.includes("looksLikeNewPendingDishTitle") && source.includes("isInlineDescriptionFollower(line)"),
  "a new dish title line must not be absorbed as description text of the previous pending dish"
);

// Funktionale Pruefung gegen das reale, unveraenderte Modul.
const { extractHtmlMenuFromHtml } = loadExtractHtmlMenuModule();

// Fixture bildet die reale Struktur von 60secondstonapoli.de/menue/ nach:
// eine Kategorie-Ueberschrift ("Pizza"), gefolgt von mehreren Gerichtsnamen
// ohne Zeilenpreis, danach ein Kategoriewechsel mit einem Gericht, das
// tatsaechlich einen festen Preis hat.
const priceLessMenuHtml = `
<h2>Pizza</h2>
<p>Margherita</p>
<p>Salsiccia Style</p>
<p>The Rock</p>
<p>Schinken Champignons</p>
<p>Cowabunga</p>
<h2>Dessert</h2>
<p>Dubai Schokoladen Pizza 16,00</p>
<p>Tiramisu</p>
`;

const priceLessResult = extractHtmlMenuFromHtml(priceLessMenuHtml);
const pizzaTitles = priceLessResult.items
  .filter((item) => item.category === "Pizza")
  .map((item) => item.title);

assert(
  ["Margherita", "Salsiccia Style", "The Rock", "Schinken Champignons", "Cowabunga"]
    .every((title) => pizzaTitles.includes(title)),
  `every price-less pizza must survive extraction as its own dish, got: ${JSON.stringify(pizzaTitles)}`
);
assert(pizzaTitles.length === 5, `pizza dishes must not be merged into one another, got: ${JSON.stringify(pizzaTitles)}`);
assert(
  priceLessResult.items.filter((item) => item.category === "Pizza").every((item) => !item.price),
  "price-less dishes must keep price undefined rather than fabricating one"
);

const dubaiPizza = priceLessResult.items.find((item) => item.title === "Dubai Schokoladen Pizza");
assert(dubaiPizza, "a dish with a real inline price must still be extracted");
assert(dubaiPizza.price === "16,00 €", `real price must be preserved unchanged, got: ${dubaiPizza.price}`);

const tiramisu = priceLessResult.items.find((item) => item.title === "Tiramisu");
assert(tiramisu, "a price-less dish at the very end of the document (EOF) must also be recovered");
assert(!tiramisu.price, "the EOF-recovered dish must not have a fabricated price");

// Regressionscheck: normale Preis-Flows mit mehrzeiliger Beschreibung
// duerfen durch die Aenderung nicht beeinflusst werden.
const regularMenuHtml = `
<h2>Vorspeisen</h2>
<p>Burrata</p>
<p>mit Tomaten, Basilikum und Olivenoel</p>
<p>9,50</p>
<p>Bruschetta</p>
<p>12,00</p>
`;

const regularResult = extractHtmlMenuFromHtml(regularMenuHtml);
assert(regularResult.items.length === 2, `unrelated priced flow must be unaffected, got: ${regularResult.items.length} items`);

const burrata = regularResult.items.find((item) => item.title === "Burrata");
assert(burrata?.price === "9,50 €", "existing price + multi-line description flow must keep working");
assert(burrata?.description === "mit Tomaten, Basilikum und Olivenoel", "existing description capture must keep working");

// Struktur-Absicherung fuer die zusammengesetzte Kategorie-Erkennung.
assert(
  source.includes("function findCombinedCategorySegments"),
  "extractHtmlMenu.ts must keep the combined-category-heading detector"
);
assert(
  extractBalancedBlock(source, "function findCombinedCategorySegments(line: string): string[] | null {")
    .includes("segments.every((segment) => CATEGORY_TERMS.has(segment))"),
  "a combined heading must only be recognized when EVERY segment is a known category term (avoids false positives like a dish named \"Fisch & Chips\")"
);

// Funktionale Pruefung: eine zusammengesetzte Kategorie-Ueberschrift
// ("Vorspeisen & Salate") muss erkannt werden, damit die Gerichte darunter
// ueberhaupt eine Kategorie bekommen (Voraussetzung fuer
// finishPendingWithoutPrice, siehe oben) - vorher gingen solche Abschnitte
// komplett verloren, weil kein exakter Taxonomie-Treffer vorlag.
const combinedCategoryHtml = `
<h2>Vorspeisen & Salate</h2>
<p>Burrata</p>
<p>Caesar Salad</p>
<h2>Pizza</h2>
<p>Margherita</p>
`;

const combinedResult = extractHtmlMenuFromHtml(combinedCategoryHtml);
const combinedBurrata = combinedResult.items.find((item) => item.title === "Burrata");
const caesarSalad = combinedResult.items.find((item) => item.title === "Caesar Salad");

assert(combinedBurrata, "a dish under a combined category heading must still be extracted");
assert(
  combinedBurrata.category === "Vorspeisen & Salate",
  `combined heading must be attached as category, got: ${combinedBurrata.category}`
);
assert(!combinedBurrata.price, "price-less dish under a combined heading must not get a fabricated price");
assert(combinedBurrata.dishRole && combinedBurrata.dishRole !== "unknown", "combined heading must resolve to a real dishRole instead of falling back to unknown");
assert(caesarSalad?.category === "Vorspeisen & Salate", "second dish under the same combined heading must also get the category");

// Negativtest: ein Gerichtsname, der zufaellig einen Kategoriebegriff
// enthaelt ("Fisch"), darf NICHT als Kategorie-Ueberschrift fehlklassifiziert
// werden, nur weil das zweite Wort ("Chips") kein bekannter Begriff ist.
const falsePositiveGuardHtml = `
<h2>Hauptgerichte</h2>
<p>Fisch & Chips</p>
<p>12,50</p>
`;

const falsePositiveResult = extractHtmlMenuFromHtml(falsePositiveGuardHtml);
const fishAndChips = falsePositiveResult.items.find((item) => item.title === "Fisch & Chips");

assert(fishAndChips, `"Fisch & Chips" must be extracted as a dish, not swallowed as a mistaken category line, got items: ${JSON.stringify(falsePositiveResult.items.map((i) => i.title))}`);
assert(fishAndChips.category === "Hauptgerichte", `"Fisch & Chips" must stay under its real category, got: ${fishAndChips.category}`);
assert(fishAndChips.price === "12,50 €", "the real price of the dish must still be captured");

console.log("html menu price-less dish regression passed");
