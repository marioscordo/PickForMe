import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

// Fallanalyse Aug 2026 (Mario): "Wenn ich das Land nicht weiss, wieso kann
// GustaroAI Rubel in Euro umrechnen?" / "Wir uebersetzen die Sprache in die
// Ausgabesprache, also Russisch in Deutsch - dann weiss ich doch, dass es
// russisch ist!" - menuLanguage ist ein separates, selbst-berichtetes
// KI-Feld und kann "unknown" liefern, obwohl dieselbe KI-Antwort bereits
// russischen Originaltext in nameOriginal/descriptionOriginal enthaelt (die
// Waehrungserkennung RUB->EUR laeuft unabhaengig davon rein ueber die
// .ru-Domain, siehe priceCompatibility.ts - das war kein Beweis fuer eine
// korrekte Spracherkennung). Fix: deterministischer, KI-unabhaengiger
// Cross-Check nur fuer den "unknown"-Fall - kyrillische Zeichen im bereits
// extrahierten Originaltext sind eindeutig und werden auf "ru" aufgeloest.
// Ein bereits von der KI erkannter Wert wird nie ueberschrieben.

const mainDishAi = read("apps/api/src/ai/recommendMainDishesAI.ts");

// 1) Die Funktion existiert, arbeitet rein auf Unicode-Zeichenbereich (kein
// weiterer KI-Call) und ist als reine Funktion mit den Original-Texten der
// Kandidaten aufrufbar.
assert(
  mainDishAi.includes("const CYRILLIC_SCRIPT_PATTERN = /[\\u0400-\\u04FF]/;"),
  "a Cyrillic Unicode range pattern must exist for deterministic script detection"
);
assert(
  mainDishAi.includes("function containsCyrillicScript(text: string | null | undefined): boolean {"),
  "containsCyrillicScript must be a pure, exported-shape helper"
);
assert(
  mainDishAi.includes("function resolveMenuLanguageWithScriptFallback("),
  "resolveMenuLanguageWithScriptFallback must exist"
);

// 2) Nur der "unknown"-Fall wird ueberhaupt angefasst - ein bereits von der
// KI erkannter Wert (de/en/it/es/fr/id/ru) wird nie ueberschrieben.
assert(
  /function resolveMenuLanguageWithScriptFallback\([^)]*\): MenuLanguage \{\s*if \(menuLanguage !== "unknown"\) \{\s*return menuLanguage;\s*\}/.test(
    mainDishAi
  ),
  "the fallback must return the AI-reported menuLanguage unchanged whenever it is not \"unknown\" - no overruling of an existing AI answer"
);

// 3) Sowohl nameOriginal als auch descriptionOriginal werden geprueft (nicht
// nur der Name), damit z. B. ein transliterierter Name mit kyrillischer
// Beschreibung trotzdem erkannt wird.
assert(
  mainDishAi.includes(
    "containsCyrillicScript(item.nameOriginal) || containsCyrillicScript(item.descriptionOriginal)"
  ),
  "both nameOriginal and descriptionOriginal must be checked for Cyrillic script"
);

// 4) Der Fallback wird an genau einer Stelle angewendet: dem einzigen
// finalen Return-Punkt von recommendMainDishesAI - das ist der einzige Ort,
// an dem alle internen Codepfade (compact-dishes-Pfad, verifier-safe-Pfad)
// garantiert zusammenlaufen, bevor das Ergebnis den Aufrufer erreicht.
assert(
  mainDishAi.includes(
    "const resolvedMenuLanguage = resolveMenuLanguageWithScriptFallback(parsed.menuLanguage, parsed.recommendations);"
  ),
  "the fallback must be applied once, at the single final return point of recommendMainDishesAI"
);
assert(
  mainDishAi.includes("menuLanguage: resolvedMenuLanguage,"),
  "the function must return the resolved (possibly script-corrected) menuLanguage to all callers"
);

// 5) Diagnose-Log (Dev-only, ueber isAnalyzeDiagnosticsEnabled gated) zeigt
// sowohl den rohen KI-Wert als auch das finale Ergebnis, damit im
// Terminal-Log direkt sichtbar ist, ob/wann der Fallback gegriffen hat.
assert(
  /logDevAnalyzeTiming\(\{\s*runId,\s*phase: "api\.menu_language_resolved",\s*aiReportedMenuLanguage: parsed\.menuLanguage,\s*resolvedMenuLanguage,\s*scriptFallbackApplied: resolvedMenuLanguage !== parsed\.menuLanguage,/.test(
    mainDishAi
  ),
  "a dev diagnostic log must report both the raw AI menuLanguage value and the resolved value, plus whether the fallback fired"
);

console.log("menu language cyrillic script fallback regression passed");
