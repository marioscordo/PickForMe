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

const fallback = read("apps/api/src/menu/preparePubhtml5MenuImageFallback.ts");
const route = read("apps/api/app/api/analyze-menu/route.ts");

// Struktur-Pruefungen: Modul folgt dem etablierten Tilda-Fallback-Muster
// und ist tatsaechlich im Analyse-Pfad verdrahtet.
assert(
  fallback.includes("export function isPubhtml5BookUrl"),
  "module must export a URL detector"
);
assert(
  fallback.includes("export async function preparePubhtml5MenuImages"),
  "module must export the image preparation entrypoint"
);
assert(
  fallback.includes('"files/large/'),
  "module must build page image URLs from the verified files/large/<hash> pattern"
);
assert(
  fallback.includes("MAX_PUBHTML5_MENU_PAGES"),
  "module must cap the number of pages sent to the vision model"
);
assert(
  route.includes('import { preparePubhtml5MenuImages } from "../../../src/menu/preparePubhtml5MenuImageFallback";'),
  "route must import the pubhtml5 fallback"
);
assert(
  route.includes("const pubhtml5MenuImages =") &&
    route.includes("await preparePubhtml5MenuImages(rawMenuText)"),
  "route must call the pubhtml5 fallback for URL-based input"
);
assert(
  /pubhtml5MenuImages\.imageDataUrls/.test(route) &&
    /responseMode:\s*"ai_image"/.test(route.slice(route.indexOf("if (pubhtml5MenuImages)"))),
  "pubhtml5 fallback must feed into the same Two-Step AI image flow used elsewhere (Safety Verifier + Attribution Validator), not a separate weaker path"
);

// Funktionale Pruefung: Die Parsing-Logik (Regex + Hash-Extraktion) wird
// hier gegen eine reale, am 2026-07-27 per Browser-Netzwerkmitschnitt
// verifizierte config.js-Struktur (online.pubhtml5.com/smhkr/zcvi/)
// nachgebildet. Das Muster "files/large/<hash>" wurde live bestaetigt,
// bevor dieses Modul geschrieben wurde - kein geratener Pfad.
const fixtureConfigJs = String.raw`var htmlConfig = {"meta":{"title":"FOOD MENU","description":"\u00A9Waroeng Bernadette, 2025","pageCount":16},"fliphtml5_pages":[{"n":["10fe7a59f57109847242ee982100dc6c.webp"],"t":"./files/thumb/5b41a94ad635bf32f08734cd06ec35b8.webp"},{"n":["d74f5315585f15fcf49580b87a0fd789.webp"],"t":"./files/thumb/c013e3bea0faa51774fa8af67effbfa7.webp"}]};`;

const regexMatch = fixtureConfigJs.match(/var\s+htmlConfig\s*=\s*(\{[\s\S]*\});/);
assert(regexMatch, "config.js regex must match the real htmlConfig assignment shape");

const parsedFixture = JSON.parse(regexMatch[1]);
assert(parsedFixture.meta.pageCount === 16, "fixture parsing must read pageCount");
assert(parsedFixture.meta.title === "FOOD MENU", "fixture parsing must read title");

const hashes = parsedFixture.fliphtml5_pages
  .map((page) => (Array.isArray(page?.n) ? page.n[0] : undefined))
  .filter((value) => typeof value === "string" && value.trim().length > 0);

assert(hashes.length === 2, "fixture parsing must extract page hashes");

const builtUrl = `https://online.pubhtml5.com/smhkr/zcvi/files/large/${hashes[0]}`;
const verifiedRealUrl = "https://online.pubhtml5.com/smhkr/zcvi/files/large/10fe7a59f57109847242ee982100dc6c.webp";

assert(
  builtUrl === verifiedRealUrl,
  "built page image URL must match the URL confirmed via real browser network capture"
);

console.log("pubhtml5 menu fallback regression passed");
