import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Fallanalyse Juli 2026: ein realer Aufruf ueber den Linked-Image-Fallback
// (4 Bilder nach dem Familien-Filter) brauchte 64s, das Zeitbudget lag aber
// bei 60000ms -> TWO_STEP_MAIN_AI_TIMEOUT -> HTTP 504. pubhtml5-, Tilda- und
// der generische Linked-Image-Fallback senden seit den Session-Fixes
// (Familien-Filter, Tilda-Mehrseiten) bewusst mehrere volle Bilder statt
// nur eines. Fix: Zeitbudget fuer alle drei Bild-Fallback-Zweige auf
// 90000ms angehoben (analog zum PDF-Budget), unterhalb des Mobile-Client-
// Timeouts von 105000ms.
//
// Zusaetzlich: die laengere Wartezeit machte sichtbar, dass die
// Lade-Schritt-Anzeige per Modulo endlos im Kreis lief - fuer die Nutzerin
// sah das aus wie ein Neustart/Haenger ("Aktionen, die sich wiederholen").
// Fix: mehr, laenger tragende Lade-Schritte plus ein ruhiger Schluss-Status,
// bei dem die Anzeige stehen bleibt statt erneut von vorne zu beginnen.

const route = fs
  .readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8")
  .replace(/\r\n/g, "\n");
const loadingBox = fs
  .readFileSync("apps/mobile/src/components/pick/AnalysisLoadingBox.tsx", "utf8")
  .replace(/\r\n/g, "\n");
const deDE = fs.readFileSync("apps/mobile/src/content/mobileContent.de-DE.json", "utf8");
const enUS = fs.readFileSync("apps/mobile/src/content/mobileContent.en-US.json", "utf8");

// 1) Zeitbudget
assert(
  route.includes("const MULTI_IMAGE_FALLBACK_AI_TIMEOUT_MS = 90000;"),
  "route.ts must define the raised 90000ms timeout budget for multi-image fallbacks"
);
assert(
  !route.includes("timeoutMs: 60000,"),
  "no image-fallback branch may still use the old 60000ms budget"
);
const multiImageTimeoutUsageCount = (route.match(/timeoutMs: MULTI_IMAGE_FALLBACK_AI_TIMEOUT_MS,/g) ?? []).length;
assert(
  multiImageTimeoutUsageCount === 3,
  `expected exactly 3 usages of the raised timeout (pubhtml5, Tilda, linked-image), found ${multiImageTimeoutUsageCount}`
);

// 2) Lade-Schritte: mehr Schritte, letzter Schritt ist eine ruhige
// "dauert laenger"-Nachricht.
const deDEParsed = JSON.parse(deDE);
const enUSParsed = JSON.parse(enUS);
assert(deDEParsed.pick.loadingSteps.length >= 7, "German loading steps must be extended to cover a longer wait");
assert(enUSParsed.pick.loadingSteps.length >= 7, "English loading steps must be extended to cover a longer wait");
assert(
  /etwas länger/.test(deDEParsed.pick.loadingSteps.at(-1)),
  "the last German loading step must reassure the user about a longer-than-usual wait"
);
assert(
  /take a bit longer|can take longer/.test(enUSParsed.pick.loadingSteps.at(-1)),
  "the last English loading step must reassure the user about a longer-than-usual wait"
);

// 3) Kein Modulo-Loop mehr - die Anzeige muss am letzten Schritt stehen
// bleiben statt wieder bei Schritt 1 zu beginnen.
assert(
  !loadingBox.includes("(current + 1) % steps.length"),
  "the looping (modulo) step advance must be removed"
);
assert(
  loadingBox.includes("Math.min(current + 1, steps.length - 1)"),
  "the step advance must clamp at the last step instead of wrapping around"
);

console.log("multi-image timeout and loading UX regression passed");
