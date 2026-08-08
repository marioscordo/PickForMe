import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Fallanalyse Aug 2026 (Mario): bei einem sehr umfangreichen Allergie-/
// Ausschlussprofil (33 aktive Restriktionen im echten Fall) wurde ein knapp
// beschriebenes Gericht ("Rindfleisch mit gebratenem Gemuese und
// Kartoffeln") vom Safety-Verifier als "safe" eingestuft, obwohl die
// Beschreibung nichts ueber Zubereitungsdetails (Sauce, Fett, Bindung)
// aussagt. Root Cause: die bestehende "keine Zutaten erfinden"-Regel hat
// korrekt verhindert, dass die KI Zutaten annimmt - aber "nichts erwaehnt"
// wurde unabhaengig von der Anzahl aktiver Restriktionen immer als "safe"
// gewertet. Entscheidung (Mario, nach Abwaegung): die Asymmetrie der
// Fehlerkosten (falsches "uncertain" = Rueckfrage, falsches "safe" =
// moegliche allergische Reaktion) rechtfertigt eine hoehere Schwelle fuer
// "safe" bei umfangreichen Profilen. Betrifft NUR breite Profile
// (restrictions.length > 10), nicht die grosse Mehrheit der Nutzer mit
// wenigen Ausschluessen.

const verifierAi = fs
  .readFileSync("apps/api/src/ai/verifyRecommendationSafetyAI.ts", "utf8")
  .replace(/\r\n/g, "\n");

// 1) Schwellenwert existiert und wird zur Laufzeit aus restrictions.length
// bestimmt - kein pauschaler Verhaltenswechsel fuer alle Nutzer.
assert(
  verifierAi.includes("const BROAD_RESTRICTION_PROFILE_THRESHOLD = 10;"),
  "a named threshold constant for broad restriction profiles must exist"
);
assert(
  verifierAi.includes("const isBroadRestrictionProfile = restrictions.length > BROAD_RESTRICTION_PROFILE_THRESHOLD;"),
  "whether the stricter rule applies must be derived from the actual restriction count, not hardcoded"
);

// 2) Die zusaetzliche Regel wird NUR bedingt eingefuegt (schmales Profil =
// unveraendertes Prompt-Verhalten).
assert(
  /\.\.\.\(isBroadRestrictionProfile\s*\?\s*\[/.test(verifierAi),
  "the additional rule must be conditionally spliced into the prompt, not always present"
);
assert(
  verifierAi.includes("Waehle in diesem Fall fuer die betroffenen Restrictions uncertain statt safe."),
  "the additional rule text must instruct the model to prefer uncertain over safe for sparse descriptions under a broad profile"
);

// 3) Die bestehende Anti-Halluzinations-Regel bleibt unveraendert - wir
// verschaerfen nur die safe-Schwelle, wir erlauben KEINE erfundenen
// Konflikte.
assert(
  verifierAi.includes("Keine Websuche. Erfinde keine Zutaten, die im Text nicht vorkommen, und nimm nicht an, ein Gericht enthalte typische Rezeptzutaten, die nicht genannt sind."),
  "the existing do-not-invent-ingredients rule must remain intact and unweakened"
);
assert(
  verifierAi.includes("Erfinde weiterhin keine Zutaten und keinen Konflikt"),
  "the new rule must explicitly reaffirm that no conflicts may be invented - only the safe threshold changes, not the conflict threshold"
);

// 4) restrictionCount wird explizit im Input mitgeschickt (robuster als
// dass das Modell die Restrictions-Liste selbst zaehlt).
assert(
  verifierAi.includes("JSON.stringify({ restrictionCount: restrictions.length, restrictions, candidates }, null, 2)"),
  "restrictionCount must be sent explicitly in the prompt input alongside the restrictions array"
);

console.log("safety verifier broad profile uncertainty regression passed");
