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

const fallback = read("apps/api/src/menu/prepareLinkedMenuImageFallback.ts");
const route = read("apps/api/app/api/analyze-menu/route.ts");

// Struktur-Pruefungen: Modul folgt dem etablierten Tilda-/pubhtml5-
// Fallback-Muster (Two-Step-Pipeline mit Attribution-/Sicherheits-Pruefung,
// kein unverifizierter Einzel-Vision-Call) und nutzt den generischen,
// plattformunabhaengigen Bild-Finder statt einer Plattform-spezifischen
// Variante.
assert(
  fallback.includes("export async function prepareLinkedMenuImageFallback"),
  "module must export the image preparation entrypoint"
);
assert(
  fallback.includes('import { findLinkedMenuImageUrls } from "./findLinkedMenuImageUrls";'),
  "module must reuse the existing generic (non-platform-specific) image finder"
);
assert(
  fallback.includes("MAX_LINKED_MENU_IMAGE_CANDIDATES"),
  "module must cap the number of images sent to the vision model"
);

// Fallanalyse "sonnenalm.de" (Juli 2026): der Bild-Finder vergibt Score-
// Bonuspunkte sowohl fuer Speisekarten-Dateinamen als auch fuer Gerichte-
// Schlagworte, wodurch dekorative Gerichtsfotos (z.B.
// "speisekarte-fischgericht.jpg") hoeher bewertet werden koennen als die
// eigentlichen Speisekarten-Bilder. Ein zu kleines Limit wuerde echte
// Speisekarten-Seiten dann verdraengen - auf der echten sonnenalm.de-Seite
// kommen bereits 10 positiv bewertete Kandidaten zusammen (4 echte
// Speisekarten-Seiten + 6 dekorative Fotos).
const candidateLimitMatch = fallback.match(/MAX_LINKED_MENU_IMAGE_CANDIDATES\s*=\s*(\d+)/);
assert(candidateLimitMatch, "candidate limit constant must be a plain number for this guard to check");
assert(
  Number(candidateLimitMatch[1]) >= 10,
  "candidate limit must stay generous enough that decorative same-keyword photos cannot crowd out the real menu images on a page like sonnenalm.de"
);

assert(
  route.includes('import { prepareLinkedMenuImageFallback } from "../../../src/menu/prepareLinkedMenuImageFallback";'),
  "route must import the linked-image fallback"
);
assert(
  route.includes("const linkedMenuImages =") &&
    route.includes("await prepareLinkedMenuImageFallback(rawMenuText)"),
  "route must call the linked-image fallback"
);

const htmlBranch = route.slice(route.indexOf("if (htmlFoodDishCount === 0 && htmlPriceCount === 0) {"));
const tildaIndex = htmlBranch.indexOf("prepareBestTildaMenuImageFallback(rawMenuText)");
const linkedIndex = htmlBranch.indexOf("prepareLinkedMenuImageFallback(rawMenuText)");
const guardIndex = htmlBranch.indexOf('"MENU_URL_UNREADABLE"');

assert(tildaIndex >= 0 && linkedIndex >= 0 && guardIndex >= 0, "expected fallback chain (Tilda -> linked image -> fail-closed guard) not found");
assert(
  tildaIndex < linkedIndex && linkedIndex < guardIndex,
  "linked-image fallback must run after the Tilda fallback and before the fail-closed MENU_URL_UNREADABLE guard - otherwise either an existing platform fallback or this new fallback would never be reached"
);

assert(
  /responseMode:\s*"ai_image"/.test(htmlBranch.slice(linkedIndex)),
  "linked-image fallback must feed into the same Two-Step AI image flow used elsewhere (Safety Verifier + Attribution Validator), not a separate weaker path"
);
assert(
  htmlBranch.slice(linkedIndex, guardIndex).includes("linkedMenuImages.imageDataUrls"),
  "linked-image fallback must pass all found images to the AI, not just a single best guess, since a menu can be split across several image files"
);

// Der fail-closed Guard darf erst NACH beiden Bild-Fallbacks pruefen, ob
// htmlMenuExtraction leer ist - sonst wuerde er den Tilda-/Bild-Fallback nie
// erreichen lassen (das war ein Fehler in einer frueheren, nicht committeten
// Fassung dieses Guards).
assert(
  route.includes("if (htmlMenuExtraction && htmlMenuExtraction.items.length === 0) {") &&
    route.includes('"MENU_URL_UNREADABLE"'),
  "fail-closed guard for zero-item HTML extraction with no usable image must still exist"
);

console.log("linked menu image fallback regression passed");
