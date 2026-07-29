import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const source = fs
  .readFileSync("apps/api/src/menu/prepareLinkedMenuImageFallback.ts", "utf8")
  .replace(/\r\n/g, "\n");

assert(source.includes("function preferMenuImageFamily("), "family-preference function must exist");
assert(source.includes("function getMenuImageFamilyKey("), "family-key helper must exist");
assert(
  source.includes("const imageUrls = preferMenuImageFamily(rawImageUrls);"),
  "prepareLinkedMenuImageFallback must apply the family filter to the raw candidate list"
);

// Reproduziert die Kernlogik isoliert (wie die anderen Regressionsskripte in
// diesem Repo), um sie gegen die realen sonnenalm.de-Dateinamen zu pruefen -
// Fallanalyse Juli 2026: trotz passender Vorlieben ("Steak", "Schnitzel")
// fehlten diese Gerichte, weil die Bildauswahl 4 echte Speisekarten-Seiten
// mit 6 dekorativen Gerichtsfotos vermischte.
const MENU_IMAGE_FAMILY_CATEGORY_WORDS = new Set([
  "dessert", "desserts", "nachspeise", "nachspeisen", "suessspeise", "suesspeisen",
  "vorspeise", "vorspeisen", "hauptspeise", "hauptspeisen", "kinder", "kinderkarte",
  "mittagskarte", "mittag", "abendkarte", "tageskarte"
]);

function getUrlStem(value) {
  try {
    const parsed = new URL(value);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(lastSegment);
    return decoded.replace(/\.[a-zA-Z0-9]+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function getMenuImageFamilyKey(url) {
  const stem = getUrlStem(url);
  const numericMatch = stem.match(/^(.*?)[-_]?(\d+)$/);

  if (numericMatch && numericMatch[1]) {
    const base = numericMatch[1].replace(/[-_]+$/, "");

    if (base.length > 0) {
      return base;
    }
  }

  const wordMatch = stem.match(/^(.*?)[-_]([a-zA-Z]+)$/);

  if (wordMatch && wordMatch[1] && wordMatch[2]) {
    const suffix = wordMatch[2].toLowerCase();
    const base = wordMatch[1].replace(/[-_]+$/, "");

    if (base.length > 0 && MENU_IMAGE_FAMILY_CATEGORY_WORDS.has(suffix)) {
      return base;
    }
  }

  return null;
}

function preferMenuImageFamily(urls) {
  const groups = new Map();

  for (const url of urls) {
    const key = getMenuImageFamilyKey(url);

    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? [];
    group.push(url);
    groups.set(key, group);
  }

  let bestKey = null;
  let bestGroup = [];

  for (const [key, group] of groups) {
    if (group.length >= 2 && group.length > bestGroup.length) {
      bestKey = key;
      bestGroup = group;
    }
  }

  if (!bestKey) {
    return urls;
  }

  return bestGroup;
}

const base = "https://sonnenalm.de/wp-content/uploads/2024/07/";
// Reale Dateinamen von https://sonnenalm.de/de/berggasthof/speisekarte/,
// per Live-Abruf im Juli 2026 verifiziert.
const realPages = ["speisekarte-1.png", "speisekarte-2.png", "speisekarte-dessert.png", "speisekarte-kinder.png"];
const decorative = [
  "speisekarte-fischgericht.jpg",
  "speisekarte-garnele.jpg",
  "speisekarte-salat-mit-garnele.jpg",
  "speisekarte-teller.jpg",
  "speisekarte-zanderfilet.jpg",
  "speisekarte-berggasthof.jpg"
];
const allUrls = [...realPages, ...decorative].map((f) => base + f);

const result = preferMenuImageFamily(allUrls);
const expected = realPages.map((f) => base + f).sort();
const got = result.slice().sort();

assert(
  JSON.stringify(got) === JSON.stringify(expected),
  `expected exactly the 4 real menu pages, got: ${JSON.stringify(got)}`
);

for (const decorativeFile of decorative) {
  assert(getMenuImageFamilyKey(base + decorativeFile) === null, `${decorativeFile} must not match a family key`);
}

assert(
  getMenuImageFamilyKey(base + "speisekarte-1.png") === getMenuImageFamilyKey(base + "speisekarte-dessert.png"),
  "numeric and category suffixes on the same base must share one family key, not split into two 2-image groups"
);

// Ohne erkennbare Serie (nur dekorative Einzelfotos) darf sich am Verhalten
// nichts aendern - konservativer Fallback.
const noFamilyResult = preferMenuImageFamily(decorative.map((f) => base + f));
assert(
  noFamilyResult.length === decorative.length,
  "without a detected family, the input list must pass through unchanged"
);

// Ein einzelnes numerisch benanntes Bild (Gruppengroesse 1) darf keine
// Familie bilden - sonst wuerde ein einzelnes zufaellig nummeriertes Foto
// faelschlich alles andere verdraengen.
const singleNumeric = preferMenuImageFamily([base + "speisekarte-1.png", ...decorative.map((f) => base + f)]);
assert(
  singleNumeric.length === 1 + decorative.length,
  "a lone numeric match (group size 1) must not restrict the candidate set"
);

console.log("linked menu image family regression passed");
