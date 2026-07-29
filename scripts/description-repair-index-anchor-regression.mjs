import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const source = fs
  .readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8")
  .replace(/\r\n/g, "\n");

// Fallanalyse Juli 2026: die Beschreibungs-Reparatur ordnete reparierte
// translatedDescription-Werte per lose normalisiertem nameOriginal-String
// zu (Map ueber eine "normalizeNameKey"-Funktion). Bei zwei aehnlich
// benannten oder vom Reparatur-Modell nicht exakt identisch echoten Namen
// konnte dadurch die Beschreibung eines VOELLIG ANDEREN Gerichts zugeordnet
// werden (z.B. erhielt ein Haehnchen-Chakhokhbili-Gericht die Beschreibung
// eines Schweinehals-Gerichts). Fix: Zuordnung laeuft jetzt ausschliesslich
// ueber einen expliziten "index"-Anker.
assert(!source.includes("function normalizeNameKey("), "the collision-prone name-based matching helper must be fully removed (mentioned only in the historical comment now)");
assert(!source.includes("translationsByName"), "the name-keyed translation map must be removed");
assert(source.includes("const translationsByIndex = new Map("), "translation repair must build an index-keyed map");
assert(
  source.includes("repairItems.forEach((dish, index) => {") &&
    source.includes("const translatedDescription = translationsByIndex.get(index);"),
  "translation repair must re-attach descriptions by array index"
);
assert(
  source.includes("index: { type: \"integer\" }") && source.includes("required: [\"index\", \"translatedDescription\"]"),
  "the repair response schema must require an index anchor instead of an echoed name"
);
assert(
  source.includes("items: repairItems.map((dish, index) => ({\n                  index,"),
  "the repair request must send an explicit index per item"
);
assert(
  source.includes(
    "Gib den 'index'-Wert jedes items unveraendert zurueck; er dient ausschliesslich der Zuordnung und darf nicht neu vergeben, sortiert oder ausgelassen werden."
  ),
  "the repair prompt must instruct the model to echo the index unchanged"
);

// Reproduziert die Kernlogik isoliert (wie die anderen Regressionsskripte in
// diesem Repo), um zu beweisen, dass zwei Gerichte mit demselben oder sehr
// aehnlichem Namen jetzt NICHT mehr kollidieren koennen, selbst wenn das
// Reparatur-Modell (hypothetisch) fuer beide denselben nameOriginal-String
// zurueckmelden wuerde - der Index macht das irrelevant, weil er gar nicht
// mehr zur Zuordnung verwendet wird.
function parseDescriptionTranslationRepairResponse(items) {
  return {
    items: items
      .map((item) => ({
        index: typeof item.index === "number" && Number.isInteger(item.index) ? item.index : -1,
        translatedDescription: typeof item.translatedDescription === "string" ? item.translatedDescription.trim() : ""
      }))
      .filter((item) => item.index >= 0 && item.translatedDescription)
  };
}

function applyRepair(repairItems, responseItems) {
  const parsed = parseDescriptionTranslationRepairResponse(responseItems);
  const translationsByIndex = new Map(parsed.items.map((item) => [item.index, item.translatedDescription.trim()]));

  repairItems.forEach((dish, index) => {
    const translatedDescription = translationsByIndex.get(index);

    if (translatedDescription) {
      dish.translatedDescription = translatedDescription;
    }
  });
}

// Zwei Gerichte mit identischem nameOriginal (z.B. Menue-Dubletten oder ein
// Reparatur-Modell, das den Namen nicht exakt zurueckgibt) - vorher haette
// die Namens-Map hier kollidieren koennen.
const dishA = { nameOriginal: "Курица чахохбили", translatedDescription: undefined };
const dishB = { nameOriginal: "Курица чахохбили", translatedDescription: undefined };
const repairItems = [dishA, dishB];
const responseItems = [
  { index: 0, translatedDescription: "Hähnchen in Tomaten-Kräutersauce" },
  { index: 1, translatedDescription: "Schweinehals mit Kartoffeln und Gemüse" }
];

applyRepair(repairItems, responseItems);

assert(dishA.translatedDescription === "Hähnchen in Tomaten-Kräutersauce", "dish A must receive its own description, not dish B's");
assert(dishB.translatedDescription === "Schweinehals mit Kartoffeln und Gemüse", "dish B must receive its own description, not dish A's");

// Fehlender/out-of-range Index darf nichts ueberschreiben (konservativ).
const dishC = { nameOriginal: "Unbekanntes Gericht", translatedDescription: undefined };
applyRepair([dishC], [{ index: 5, translatedDescription: "sollte nicht zugeordnet werden" }]);
assert(dishC.translatedDescription === undefined, "an unmatched index must not overwrite the dish's translatedDescription");

console.log("description repair index-anchor regression passed");
