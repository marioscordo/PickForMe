import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Fallanalyse Aug 2026 (Mario, hacha.ru/theater, bildbasiertes Tilda-Menue):
// "Курица чимчури в чесночном соусе" (Haehnchen im Chimichurri mit
// Knoblauchsauce) wurde als "Kueche mit Knoblauchsosse" angezeigt - Name
// UND Beschreibung haben die Hauptzutat (Haehnchen) komplett verloren,
// ohne dass eine der bestehenden Pruefungen (identisch zum Original,
// Englisch-Leck, Lamm/Rind-Tausch) angeschlagen hat. Fix: generische
// "Protein verschwunden"-Pruefung, die den bestehenden Lamm/Rind-
// Spezialfall (hasLikelyLambBeefTranslationConflict) verallgemeinert und
// in denselben Reparatur-Mechanismus einspeist.

const localize = fs
  .readFileSync("apps/api/src/ai/localizeRecommendationDisplayTexts.ts", "utf8")
  .replace(/\r\n/g, "\n");

// 1) Neue Pruefung existiert und deckt die bekannten Produkt-Sprachen ab.
assert(
  localize.includes("const PROTEIN_KEYWORDS: Record<string, string[]> = {"),
  "a protein keyword table must exist"
);
assert(
  localize.includes('chicken: [') && /курица/.test(localize) && /chicken/.test(localize),
  "the chicken keyword list must cover at least Russian and English source/target terms (the concrete hacha.ru bug case)"
);
assert(
  localize.includes("function hasLikelyProteinDropConflict("),
  "the protein-drop check function must exist"
);

// 2) Neuer Failure-Reason ist Teil des Unions-Typs und wird tatsaechlich
// zurueckgegeben.
assert(
  localize.includes('"translated_display_protein_dropped"'),
  "the new failure reason must be part of the TranslationValidationFailureReason union"
);

// 3) Der Check ist Teil des kombinierten Validierungspfads (greift bei
// frisch reparierten UND bei unveraendert uebernommenen Uebersetzungen).
assert(
  /function getDisplayTranslationValidationFailureReason\([\s\S]{0,600}hasLikelyProteinDropConflict\(item, translation\?\.translatedName, translation\?\.translatedDescription\)/.test(localize),
  "getDisplayTranslationValidationFailureReason must run the protein-drop check on repaired translations"
);
assert(
  /function hasValidExistingDisplayText\([\s\S]{0,1200}hasLikelyProteinDropConflict\(item, item\.currentTranslatedName, existingTranslatedDescription\)/.test(localize),
  "hasValidExistingDisplayText must also run the protein-drop check on the main AI's own, unrepaired translation - this is the exact path the hacha.ru bug slipped through"
);

// 4) Der Check bewertet Name+Beschreibung ZUSAMMEN, nicht pro Feld einzeln
// (sonst waeren unnoetige Reparatur-Anfragen fuer legitime Formulierungen
// das Risiko).
assert(
  /function hasLikelyProteinDropConflict\(\s*item: TranslationRequestItem,\s*translatedName: string \| undefined,\s*translatedDescription: string \| null \| undefined\s*\)/.test(localize),
  "the protein-drop check must take both translatedName and translatedDescription together, not validate them independently"
);

// 5) Der Protein-Check darf nicht pro einzelnem Feld, sondern muss anhand
// der Original-Quelltexte (Name/Beschreibung/sourceLine) entscheiden, ob
// ein Protein-Begriff ueberhaupt erwartet wird - keine Pruefung "ins
// Blaue" ohne Quellbezug.
assert(
  /const sourceText = ` \$\{\[item\.nameOriginal, item\.descriptionOriginal, item\.sourceLine\]/.test(localize),
  "the protein check must derive the expected protein from the original source fields (nameOriginal/descriptionOriginal/sourceLine)"
);

// Hinweis: die eigentliche Erkennungslogik (PROTEIN_KEYWORDS +
// hasLikelyProteinDropConflict) wurde vor der Implementierung isoliert
// gegen den echten hacha.ru-Bug-Fall sowie gegen mehrere Nicht-Ausloese-
// Faelle (kein Protein im Original, korrekt uebersetztes Haehnchen, Lamm
// unveraendert, vegetarisches Gericht) manuell verifiziert - siehe
// Commit-Beschreibung. Dieses Skript prueft bewusst nur die statische
// Struktur (TS-Typannotationen lassen sich nicht sicher per new Function()
// isoliert ausfuehren), wie bei allen anderen Regressionsskripten in
// diesem Projekt.

console.log("translation protein drop regression passed");
