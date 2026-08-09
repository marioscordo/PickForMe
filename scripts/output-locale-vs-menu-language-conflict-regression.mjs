import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

// Fallanalyse Aug 2026 (Mario): "Prüfe, welche Wirkung die Spracheinstellung
// im Profil hat!" - Regel: profile.outputLocale (Ausgabesprache) ist die
// Dialogsprache GustaroAI<->Nutzer und gilt fuer ALLE Anzeigetexte AUSSER
// der Orderliste (orderLabels, sommelierPhrase, Kellner-Frage), die immer in
// der Landessprache der Speisekarte stehen soll (Fallback "en"). Zwei reale
// Bugs wurden auf diese Regel zurueckgefuehrt:
//
// 1) generateAllergyStaffQuestionAI.ts: buildProfilePromptLines(profile)
//    injiziert eine "Ausgabesprache: <profile.outputLocale>"-Zeile in den
//    Prompt. Das ist fuer alle anderen Aufrufer korrekt, aber hier falsch,
//    weil das Feld "question" bewusst in der Menuesprache (nicht der
//    Profilsprache) stehen soll - zwei konkurrierende Sprachsignale im
//    selben Prompt liessen das Modell die Profilsprache bevorzugen (z. B.
//    Russisch wurde zu Englisch/Deutsch). Fix: expliziter Gegenhinweis nach
//    buildProfilePromptLines() plus Wiederholung vor dem JSON-Schema.
//
// 2) recommendMainDishesAI.ts: eine hartkodierte Sonderregel nannte nur
//    Deutsch namentlich ("Bei de-DE muss translatedName eine deutsche
//    Anzeigeuebersetzung ... sein.") ohne Aequivalent fuer andere Sprachen -
//    das begünstigte bei einem kostenoptimierten Modell (gpt-4o-mini)
//    Deutsch als Ausgabe, selbst wenn targetLanguage z. B. Italienisch war
//    (Symptom: outputLocale "IT" lieferte deutschen KI-Antworttext). Fix:
//    Regel sprachneutral formuliert, gilt jetzt fuer jede Zielsprache
//    gleichermassen. Zusaetzlich wurde eine zweite, unabhaengig gepflegte
//    "Ausgabesprache"-Zeile (buildMainDishProfileContext) konsolidiert, die
//    bisher den rohen profile.outputLocale-Wert statt targetLocale/
//    targetLanguage zeigte - Risiko fuer kuenftige Divergenz zwischen zwei
//    Quellen derselben Information im selben Prompt.

const staffQuestionAi = read("apps/api/src/ai/generateAllergyStaffQuestionAI.ts");
const mainDishAi = read("apps/api/src/ai/recommendMainDishesAI.ts");

// 1) Kellner-Frage: expliziter Gegenhinweis direkt nach den Profilzeilen und
// eine Wiederholung unmittelbar vor der JSON-Ausgabe (Recency-Effekt).
assert(
  /\.\.\.buildProfilePromptLines\(profile\),\s*"",\s*(?:\/\/[^\n]*\n\s*)*`Wichtig: Die oben im Nutzerprofil genannte Ausgabesprache gilt hier NICHT\./.test(
    staffQuestionAi
  ),
  "the staff question prompt must explicitly override the Ausgabesprache line injected by buildProfilePromptLines() right after it is spliced in"
);
assert(
  staffQuestionAi.includes(
    'Letzte Erinnerung vor der Ausgabe: question muss ausschliesslich in der Sprache mit ISO-Code "${languageCode}" formuliert sein - nicht in der oben im Nutzerprofil genannten Ausgabesprache.'
  ),
  "the staff question prompt must repeat the language-code instruction immediately before the JSON schema"
);

// 2) Hauptgericht-KI: keine deutsch-spezifische Sonderregel mehr, aber die
// Kernaussage (translatedName muss eine echte Uebersetzung sein, keine
// blosse Kopie) bleibt erhalten und gilt jetzt fuer jede Sprache.
assert(
  !mainDishAi.includes("Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung"),
  "the German-only special case for translatedName must be removed"
);
assert(
  mainDishAi.includes(
    "Unabhaengig davon, welche Zielsprache oben genannt ist: translatedName muss eine echte Anzeigeuebersetzung oder ein fuer Nutzer verstaendlicher Gloss in genau dieser Zielsprache"
  ),
  "the generalized rule must apply the same translatedName requirement to every target language, not just German"
);

// 3) Hauptgericht-KI: finale Sprach-Erinnerung vor dem JSON-Schema, analog
// zur Kellner-Frage.
assert(
  /Letzte Erinnerung vor der Ausgabe: translatedName und translatedDescription muessen in \$\{targetLanguage\} \(\$\{targetLocale\}\) formuliert sein/.test(
    mainDishAi
  ),
  "the main dish prompt must repeat the target-language instruction immediately before the JSON schema"
);

// 4) buildMainDishProfileContext: konsolidierte Ausgabesprache-Zeile nutzt
// dieselben targetLocale/targetLanguage-Werte wie der Rest des Prompts,
// nicht mehr den rohen profile.outputLocale-Wert.
assert(
  /function buildMainDishProfileContext\(\s*profile: UserProfile,\s*situation: Situation \| undefined,\s*roleAssignment: RequestedDishRoleAssignment,\s*positivePreferences: string\[\],\s*searchAssignment: ActivePreferenceSearchAssignment,\s*targetLocale: string,\s*targetLanguage: string\s*\)/.test(
    mainDishAi
  ),
  "buildMainDishProfileContext must accept targetLocale/targetLanguage as parameters instead of reading profile.outputLocale directly"
);
assert(
  mainDishAi.includes(
    "`- Ausgabesprache nur fuer nutzerseitige Texte, kein Auswahlkriterium: ${targetLanguage} (${targetLocale})`"
  ),
  "the profile-context Ausgabesprache line must use the same targetLocale/targetLanguage values as the rest of the prompt, not a separately derived profile.outputLocale value"
);
assert(
  !mainDishAi.includes('${profile.outputLocale || "de-DE"}'),
  "the raw, independently-derived profile.outputLocale fallback must no longer appear in the main dish prompt"
);
assert(
  mainDishAi.includes(
    "buildMainDishProfileContext(profile, situation, roleAssignment, activePreferences, searchAssignment, targetLocale, targetLanguage)"
  ),
  "the call site must pass targetLocale/targetLanguage into buildMainDishProfileContext"
);

console.log("output locale vs menu language conflict regression passed");
