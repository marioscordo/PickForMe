import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { Situation, UserProfile } from "../types/profile";
import {
  buildTwoStepSourceContent,
  createTwoStepOpenAIClient,
  getLanguageNameForLocale,
  getTwoStepModelForSource,
  normalizeTargetLocale,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";
import {
  MainDishAIResponseSchema,
  type MainDishAIAnalyzedDish,
  type MainDishAIRecommendation,
  type MainDishAIRemovedDish,
  type MainDishAIResultSummary,
  type MainDishAISafeCandidate,
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";

type MainDishAiDiagnosticRow = {
  index: number;
  nameOriginal: string;
  translatedNamePresent?: boolean;
  translatedName?: string;
  descriptionOriginalPresent?: boolean;
  translatedDescriptionPresent?: boolean;
  detectedConflicts?: string[];
  isSafe?: boolean;
  matchedProfileValue?: string;
  profileSafetyHasKnownConflict?: boolean;
  profileSafetyUncertainForAllergy?: boolean;
  profileSafetyConflictReason?: string | null;
  reason?: string;
  inAllDishes: boolean;
  inRemovedDishes: boolean;
  inSafeCandidates: boolean;
  inRecommendations: boolean;
};

export async function recommendMainDishesAI({
  source,
  profile,
  situation,
  userLocale,
  runId,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation?: Situation;
  userLocale?: string;
  runId?: string;
  signal?: AbortSignal;
}): Promise<MainDishAIRecommendation[]> {
  const client = createTwoStepOpenAIClient();
  const targetLocale = normalizeTargetLocale(userLocale ?? profile.outputLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const request: ResponseCreateParamsNonStreaming = {
    model: getTwoStepModelForSource(source),
    input: [
      {
        role: "user",
        content: buildTwoStepSourceContent({
          prompt: buildMainDishPrompt({
            profile,
            situation,
            targetLocale,
            targetLanguage
          }),
          source
        })
      }
    ]
  };

  const response = await client.responses.create(request, signal ? { signal } : undefined);
  const parsed = MainDishAIResponseSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "{}")));
  logMainDishAiResponseDiagnostic(parsed, runId);

  return parsed.recommendations;
}

function logMainDishAiResponseDiagnostic(
  response: {
    allDishes: MainDishAIAnalyzedDish[];
    removedDishes: MainDishAIRemovedDish[];
    safeCandidates: MainDishAISafeCandidate[];
    recommendations: MainDishAIRecommendation[];
    resultSummary: MainDishAIResultSummary;
  },
  runId?: string
) {
  const rows = new Map<string, MainDishAiDiagnosticRow>();

  const getRow = (nameOriginal: string) => {
    const key = normalizeDiagnosticName(nameOriginal);
    const existing = rows.get(key);
    if (existing) return existing;

    const row: MainDishAiDiagnosticRow = {
      index: rows.size + 1,
      nameOriginal: truncateDiagnosticValue(nameOriginal),
      inAllDishes: false,
      inRemovedDishes: false,
      inSafeCandidates: false,
      inRecommendations: false
    };
    rows.set(key, row);
    return row;
  };

  response.allDishes.forEach((dish) => {
    const row = getRow(dish.nameOriginal);
    row.inAllDishes = true;
    row.descriptionOriginalPresent = hasDiagnosticValue(dish.descriptionOriginal);
    row.detectedConflicts = dish.detectedConflicts.map(truncateDiagnosticValue);
    row.isSafe = dish.isSafe;
  });

  response.removedDishes.forEach((dish) => {
    const row = getRow(dish.nameOriginal);
    row.inRemovedDishes = true;
    row.matchedProfileValue = truncateDiagnosticValue(dish.matchedProfileValue);
    row.reason = truncateDiagnosticValue(dish.reason);
  });

  response.safeCandidates.forEach((candidate) => {
    const row = getRow(candidate.nameOriginal);
    row.inSafeCandidates = true;
    row.descriptionOriginalPresent = row.descriptionOriginalPresent ?? hasDiagnosticValue(candidate.descriptionOriginal);
    row.reason = row.reason ?? truncateDiagnosticValue(candidate.scoreReason);
  });

  response.recommendations.forEach((recommendation) => {
    const row = getRow(recommendation.nameOriginal);
    row.inRecommendations = true;
    row.translatedNamePresent = hasDiagnosticValue(recommendation.translatedName);
    row.translatedName = truncateDiagnosticValue(recommendation.translatedName);
    row.descriptionOriginalPresent = row.descriptionOriginalPresent ?? hasDiagnosticValue(recommendation.descriptionOriginal);
    row.translatedDescriptionPresent = hasDiagnosticValue(recommendation.translatedDescription);
    row.profileSafetyHasKnownConflict = recommendation.profileSafety.hasKnownConflict;
    row.profileSafetyUncertainForAllergy = recommendation.profileSafety.uncertainForAllergy;
    row.profileSafetyConflictReason = recommendation.profileSafety.conflictReason
      ? truncateDiagnosticValue(recommendation.profileSafety.conflictReason)
      : null;
    row.reason = row.reason ?? truncateDiagnosticValue(recommendation.reason);
  });

  console.info(`[GUSTARO_2STEP_MAIN_DIAG] ${JSON.stringify({
    runId,
    resultSummary: response.resultSummary,
    rows: Array.from(rows.values())
  })}`);
}

function hasDiagnosticValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function truncateDiagnosticValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function normalizeDiagnosticName(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function buildMainDishPrompt({
  profile,
  situation,
  targetLocale,
  targetLanguage
}: {
  profile: UserProfile;
  situation?: Situation;
  targetLocale: string;
  targetLanguage: string;
}) {
  const activePreferences = getActivePreferenceValues(profile);
  const searchAssignment = buildActivePreferenceSearchAssignment(activePreferences);
  const structuredAssignment = buildStructuredMainDishAssignment({
    profile,
    situation,
    activePreferences,
    searchAssignment,
    targetLocale
  });

  return [
    "Du bist GustaroAI in der neuen 2+2-AI-Architektur.",
    "Du bist der Main-AI-Concierge fuer Hauptgerichte.",
    "Du bekommst Profil, Situation, Regeln und Speisekarte vollstaendig strukturiert.",
    "Liefere genau die benoetigten Hauptgericht-Empfehlungen, nicht die komplette Speisekarte.",
    "Aufgabe: Bilde zuerst einen sicheren Kandidatenraum und waehle erst daraus genau 3 echte Hauptgerichte aus.",
    "Arbeite in dieser Reihenfolge:",
    "1. Analysiere die Speisekarte.",
    "2. Ermittle alle verfuegbaren Hauptgerichte mit Gerichtsname und vollstaendiger sichtbarer Beschreibung, soweit aus der Quelle erkennbar.",
    "3. Pruefe fuer jedes Gericht immer Gerichtsname UND vollstaendige sichtbare Beschreibung auf aktive Allergene.",
    "4. Pruefe fuer jedes Gericht immer Gerichtsname UND vollstaendige sichtbare Beschreibung auf aktive Ausschluesse oder aktive Unvertraeglichkeiten aus customExclusions.",
    "5. Entferne alle Gerichte, die mindestens einen aktiven Allergenwert enthalten.",
    "6. Entferne alle Gerichte, die mindestens einen aktiven Ausschluss oder eine aktive Unvertraeglichkeit aus customExclusions enthalten.",
    "7. Bewerte nur die verbleibenden sicheren Gerichte anhand der Vorlieben aus primaryLikes und der aktuellen Situation.",
    "8. Liefere genau 3 Empfehlungen, wenn mindestens 3 sichere Gerichte vorhanden sind.",
    "9. Wenn weniger als 3 sichere Gerichte vorhanden sind, liefere nur die sicheren Gerichte und erklaere im JSON resultSummary.lessThanThreeReason warum weniger als 3 moeglich waren.",
    "Wenn mindestens 3 sichere Hauptgerichte in der Speisekarte vorhanden sind, musst du genau 3 Empfehlungen liefern.",
    "Liefere nur dann weniger als 3 Empfehlungen, wenn die Speisekarte nach verbindlicher Pruefung harter Tabus tatsaechlich weniger als 3 sichere Hauptgerichte enthaelt.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Strukturierter Auftrag:",
    JSON.stringify(structuredAssignment, null, 2),
    "",
    "Verbindliche Regeln:",
    ...searchAssignment.rules,
    "- Alle Ausschluesse, Unvertraeglichkeiten und aktiven Allergene sind harte Tabus.",
    "- Harte Tabus stehen immer ueber Vorlieben, Situation, Beliebtheit, Preis, Kategorie oder Restaurantklassikern.",
    "- Vorlieben sind positive Orientierung; sie duerfen harte Tabus niemals ueberstimmen.",
    "- Ein Gericht darf niemals empfohlen werden, wenn es eine aktive Allergie, einen aktiven Ausschluss oder eine erkannte harte Unvertraeglichkeit enthaelt.",
    "- Fuer diese harte Konfliktpruefung musst du immer den Gerichtsnamen UND die vollstaendige sichtbare Beschreibung analysieren.",
    "- Wenn Gerichtsname und Beschreibung unterschiedlich wirken, ist die Beschreibung fuer Konflikte massgeblich.",
    "- Ein Vorkommen eines aktiven Ausschlussbegriffs in der Beschreibung fuehrt immer zur Entfernung des Gerichts.",
    "- Entfernte Gerichte muessen in removedDishes mit matchedProfileValue und reason nachvollziehbar auftauchen.",
    "- removedDishes muss auch Gerichte enthalten, bei denen ein aktiver Ausschluss nur in der Beschreibung, nicht aber im Namen vorkommt.",
    "- safeCandidates darf nur Gerichte enthalten, die nach deiner Konfliktpruefung sicher sind.",
    "- recommendations darf nur aus safeCandidates ausgewaehlt werden.",
    "- Wenn ein bevorzugter Kandidat wegen harter Tabus nicht passt, waehle ein anderes sicheres Hauptgericht aus der Speisekarte.",
    "- Reduziere nicht freiwillig auf 0, 1 oder 2 Empfehlungen, solange mindestens 3 sichere Hauptgerichte verfuegbar sind.",
    "- Brich die Auswahl nicht ab, nur weil ein Kandidat blockiert ist; suche aktiv nach einem sicheren Ersatzgericht.",
    "- Empfiehl kein Gericht mit bekanntem oder sichtbarem Profilkonflikt.",
    "- Entferne Gerichte nur, wenn ein aktiver harter Profilwert im sichtbaren Gerichtsnamen oder in der sichtbaren Beschreibung erkennbar vorkommt.",
    "- Entferne kein Gericht wegen blosser Vermutung, unbekannter Zubereitung oder Formulierungen wie koennte enthalten.",
    "- Wenn kein sichtbarer Konflikt erkennbar ist, darf das Gericht nicht allein wegen Unsicherheit in removedDishes landen.",
    "- Wenn Sahne, Rahm, Cream oder Panna in Ausschluessen, Unvertraeglichkeiten oder Allergenen aktiv ist: kein Gericht mit Sahne, Sahnesosse, Sahnesauce, Rahm, Cream, Cream sauce oder Panna empfehlen.",
    "- Beispiel Modo Mio: Name Spaghetti al Tartufo wirkt unkritisch, aber die Beschreibung enthaelt Pecorino-Trueffel-Sahnesauce; bei Ausschluss Sahne muss dieses Gericht entfernt werden.",
    "- Nutze nur echte Hauptgerichte, die belegbar in der Speisekarte vorkommen.",
    "- Keine Vorspeisen, Desserts, Getraenke, Beilagen, Zutaten oder Beschreibungsteile als Hauptgericht empfehlen.",
    "- Wenn ein Risiko in einem gelieferten Ergebnis erkannt wird, muss profileSafety dies korrekt markieren.",
    "- profileSafety.hasKnownConflict muss fuer jede Empfehlung false sein.",
    "- profileSafety.checkedAgainst muss die aktiven harten Profilwerte enthalten, gegen die du die Empfehlung geprueft hast.",
    "- Ein Gericht darf nicht wegen fehlendem Preis ausgeschlossen werden.",
    "- priceRaw ist optional und darf null oder fehlen.",
    "- sourceEvidence soll geliefert werden, wenn ein kurzer Beleg sicher moeglich ist.",
    "- sourceEvidence darf null oder fehlen, wenn kein knapper Beleg sicher angegeben werden kann.",
    "- Wenn der sichtbare Menueeintrag eine echte Beschreibung enthaelt, gib descriptionOriginal als vollstaendige originale Beschreibung aus.",
    "- translatedDescription ist optional und darf nur gesetzt werden, wenn descriptionOriginal vorhanden ist.",
    `- translatedDescription muss descriptionOriginal treu in ${targetLanguage} (${targetLocale}) wiedergeben.`,
    "- Wenn keine echte Beschreibung sichtbar ist, lasse descriptionOriginal und translatedDescription null oder weg.",
    "- Erfinde keine Beschreibung, Zutaten oder Details.",
    "- translatedName ist Pflicht und ist die nutzerseitige Anzeigeuebersetzung in der Zielsprache.",
    `- translatedName muss in ${targetLanguage} (${targetLocale}) formuliert sein.`,
    "- Jede Empfehlung muss einen display-sicheren translatedName enthalten.",
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Kopiere nameOriginal nicht einfach als translatedName, wenn der Originalname fremdsprachig ist; liefere dann eine knappe belegbare Anzeigeuebersetzung.",
    "- Eigennamen oder unveraenderliche Gerichtstitel duerfen teilweise erhalten bleiben, aber translatedName muss trotzdem in der Zielsprache verstaendlich sein.",
    "- Uebersetze nur, was durch sourceEvidence oder Speisekartentext belegbar ist.",
    "- Erfinde keine Zutaten und fuege keine freien Ausschmueckungen hinzu.",
    "- Keine nachgelagerte Qualitaetskontrolle voraussetzen: die Auswahl muss in diesem Call korrekt sein.",
    "- Kein PDF-Fuzzy-Matching voraussetzen: entscheide nur aus dem sichtbaren Speisekartenkontext.",
    "",
    buildMainDishProfileContext(profile, situation, activePreferences, searchAssignment),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "allDishes": [',
    "    {",
    '      "nameOriginal": "exakter Originalname aus der Speisekarte",',
    '      "descriptionOriginal": "vollstaendige sichtbare Originalbeschreibung falls vorhanden, sonst null",',
    '      "price": "Preis falls sichtbar, sonst null",',
    '      "detectedConflicts": ["aktive Profilwerte, die in Name oder Beschreibung erkannt wurden"],',
    '      "isSafe": true',
    "    }",
    "  ],",
    '  "removedDishes": [',
    "    {",
    '      "nameOriginal": "entferntes Gericht",',
    '      "matchedProfileValue": "aktiver Ausschluss oder aktives Allergen",',
    '      "reason": "kurzer Grund in der Zielsprache, inklusive ob der Konflikt im Namen oder in der Beschreibung stand"',
    "    }",
    "  ],",
    '  "safeCandidates": [',
    "    {",
    '      "nameOriginal": "sicherer Kandidat",',
    '      "descriptionOriginal": "vollstaendige sichtbare Originalbeschreibung falls vorhanden, sonst null",',
    '      "scoreReason": "kurze Bewertung anhand Vorlieben und Situation in der Zielsprache"',
    "    }",
    "  ],",
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "nameOriginal": "exakter Originalname aus der Speisekarte",',
    '      "translatedName": "display-sichere nutzerseitige Anzeigeuebersetzung in der Zielsprache",',
    '      "descriptionOriginal": "vollstaendige Originalbeschreibung falls sichtbar, sonst null",',
    '      "translatedDescription": "treue Uebersetzung der Originalbeschreibung falls vorhanden, sonst null",',
    '      "priceRaw": "Preis falls sichtbar, sonst null oder weglassen",',
    '      "sourceEvidence": "kurzer belegender Originalausschnitt aus der Speisekarte",',
    '      "sourceKind": "pdf | html | image | text | unknown",',
    '      "sourceUrl": "Quellen-URL falls bekannt, sonst null",',
    '      "sourceCategoryOriginal": "sichtbare Kategorie falls hilfreich, sonst null",',
    '      "reason": "kurze profilbezogene Begruendung in der Zielsprache",',
    '      "confidence": "high | medium | low",',
    '      "profileSafety": {',
    '        "hasKnownConflict": false,',
    '        "uncertainForAllergy": false,',
    '        "conflictReason": null,',
    '        "checkedAgainst": ["aktive harte Profilwerte"]',
    "      }",
    "    }",
    "  ],",
    '  "resultSummary": {',
    '    "allDishCount": 0,',
    '    "removedDishCount": 0,',
    '    "safeCandidateCount": 0,',
    '    "recommendationCount": 0,',
    '    "lessThanThreeReason": null',
    "  }",
    "}"
  ].join("\n");
}

function buildMainDishProfileContext(
  profile: UserProfile,
  situation: Situation | undefined,
  positivePreferences: string[],
  searchAssignment: ActivePreferenceSearchAssignment
) {
  const hardExclusions = uniqueValues(arrayValue(profile.customExclusions));
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));
  return [
    "Nutzerprofil fuer diesen Main-AI-Call:",
    `- Ausgabesprache nur fuer nutzerseitige Texte, kein Auswahlkriterium: ${profile.outputLocale || "de-DE"}`,
    `- Aktuelle Essenssituation/Modus: ${situation || profile.appetiteMood || "nicht angegeben"}`,
    `- Anzahl aktiver heutiger Vorlieben/Wunschrichtungen: ${positivePreferences.length}`,
    `- Aktive heutige Vorlieben/Wunschrichtungen: ${listOrNone(positivePreferences)}`,
    `- Aktiver Suchauftrag: ${searchAssignment.instruction}`,
    `- Aktiver Suchraum: ${searchAssignment.searchSpaceLabel}`,
    `- Aktive Ausschluesse und Unvertraeglichkeiten: ${listOrNone(hardExclusions)}`,
    `- Aktive Allergene: ${listOrNone(hardAllergens)}`,
    "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten sind wichtiger als Vorlieben und Situation.",
    "- Bei harten Ausschluessen, Allergien und Unvertraeglichkeiten gilt: Nur sichtbare Konflikte aus Gerichtsname oder Beschreibung entfernen; nicht wegen blosser Vermutung entfernen.",
    "- Aktive Vorlieben definieren den Suchraum fuer diesen Empfehlungslauf.",
    "- Diese Signale stammen aus dem aktuellen Request-Profil und duerfen nicht aus frueheren Analysen ersetzt werden."
  ].join("\n");
}

function buildStructuredMainDishAssignment({
  profile,
  situation,
  activePreferences,
  searchAssignment,
  targetLocale
}: {
  profile: UserProfile;
  situation?: Situation;
  activePreferences: string[];
  searchAssignment: ActivePreferenceSearchAssignment;
  targetLocale: string;
}) {
  const hardExclusions = uniqueValues(arrayValue(profile.customExclusions));
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));

  return {
    analyse: {
      profil: {
        vorlieben: activePreferences,
        ausschluesse_und_unvertraeglichkeiten: hardExclusions,
        allergene: hardAllergens,
        ausgabesprache: targetLocale
      },
      situation: {
        modus: situation || profile.appetiteMood || "nicht angegeben"
      },
      regeln: {
        anzahl_gerichte: 3,
        zuerst_alle_erkennbaren_hauptgerichte_analysieren: true,
        gerichtsnamen_und_vollstaendige_sichtbare_beschreibungen_pruefen: true,
        beschreibung_ist_bei_konflikten_massgeblich: true,
        ausschluss_in_beschreibung_fuehrt_zur_entfernung: true,
        konfliktgerichte_entfernen_bevor_empfohlen_wird: true,
        empfehlungen_nur_aus_sicheren_kandidaten: true,
        genau_3_wenn_mindestens_3_sichere_gerichte_vorhanden: true,
        nicht_freiwillig_auf_weniger_als_3_reduzieren: true,
        ersatzgericht_waehlen_wenn_kandidat_blockiert_ist: true,
        harte_ausschluesse_sind_verbindlich: true,
        allergene_sind_verbindlich: true,
        unvertraeglichkeiten_sind_verbindlich: true,
        vorlieben_sind_positive_orientierung: true,
        vorlieben_duerfen_harte_ausschluesse_nicht_ueberstimmen: true,
        nur_speisekarteninformationen: true,
        beschreibung_nur_wenn_vorhanden: true,
        keine_beschreibung_erfinden: true,
        translated_name_pflicht_und_display_sicher: true,
        translated_name_darf_bei_fremdsprachigem_original_nicht_blosse_kopie_sein: true,
        removed_dishes_mit_matched_profile_value_ausgeben: true,
        less_than_three_reason_erforderlich_wenn_weniger_als_3_empfehlungen: true,
        keine_nachgelagerte_qualitaetskontrolle: true,
        kein_pdf_fuzzy_matching: true
      },
      suchauftrag: {
        instruktion: searchAssignment.instruction,
        suchraum: searchAssignment.searchSpaceLabel
      },
      speisekarte: "siehe Quellenkontext/Speisekartentext oder angehaengte Speisekartendateien"
    },
    auftrag: "Analysiere zuerst alle erkennbaren Hauptgerichte, entferne Gerichte mit aktiven Ausschluessen oder Allergenen, bilde daraus sichere Kandidaten und waehle erst danach genau 3 Empfehlungen, wenn mindestens 3 sichere Hauptgerichte vorhanden sind."
  };
}

type ActivePreferenceSearchAssignment = {
  kind: "none" | "single" | "multiple";
  instruction: string;
  searchSpaceLabel: string;
  rules: string[];
};

function getActivePreferenceValues(profile: UserProfile) {
  return uniqueValues([
    ...arrayValue(profile.primaryLikes)
  ]);
}

function buildActivePreferenceSearchAssignment(values: string[]): ActivePreferenceSearchAssignment {
  if (values.length === 0) {
    return {
      kind: "none",
      instruction: "Empfiehl genau 3 passende Hauptgerichte aus dieser Speisekarte, wenn mindestens 3 sichere Hauptgerichte vorhanden sind.",
      searchSpaceLabel: "allgemeine passende Hauptgerichte",
      rules: [
        "- Es gibt keine aktive Wunschrichtung; waehle genau 3 passende echte Hauptgerichte aus der Speisekarte, wenn mindestens 3 sichere Hauptgerichte vorhanden sind.",
        "- Liefere nur weniger als 3 Empfehlungen, wenn nach harter Tabu-Pruefung tatsaechlich weniger sichere Hauptgerichte vorhanden sind.",
        "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten bleiben verbindlich."
      ]
    };
  }

  if (values.length === 1) {
    const searchTarget = toSearchTargetLabel(values[0]!);

    return {
      kind: "single",
      instruction: `Empfiehl genau 3 Gerichte und priorisiere dabei den aktiven Suchraum: ${searchTarget}.`,
      searchSpaceLabel: searchTarget,
      rules: [
        `- Wenn die Speisekarte genuegend passende ${searchTarget} enthaelt, muessen alle Empfehlungen ${searchTarget} sein.`,
        `- Wenn weniger passende ${searchTarget} sicher erkennbar sind, ergaenze mit anderen sicheren Hauptgerichten aus der Speisekarte, bis 3 Empfehlungen erreicht sind.`,
        "- Liefere nur weniger als 3 Empfehlungen, wenn nach harter Tabu-Pruefung insgesamt weniger als 3 sichere Hauptgerichte vorhanden sind.",
        "- Fuelle nicht mit neutralen Kategorien ausserhalb des Suchraums auf.",
        "- Erfinde nichts.",
        "- Nutze nur echte Gerichte aus der Speisekarte."
      ]
    };
  }

  const searchTargets = uniqueValues(values.map(toSearchTargetLabel));
  const searchSpace = joinSearchTargets(searchTargets);

  return {
    kind: "multiple",
    instruction: `Empfiehl genau 3 Gerichte und priorisiere dabei den aktiven Suchraum: ${searchSpace}.`,
    searchSpaceLabel: searchSpace,
    rules: [
      "- Empfehlungen muessen aus diesem Suchraum stammen, wenn passende Gerichte vorhanden sind.",
      "- Fuelle nicht mit neutralen Kategorien ausserhalb des Suchraums auf.",
      "- Wenn nur weniger sichere Treffer im Suchraum erkennbar sind, ergaenze mit anderen sicheren Hauptgerichten aus der Speisekarte, bis 3 Empfehlungen erreicht sind.",
      "- Liefere nur weniger als 3 Empfehlungen, wenn nach harter Tabu-Pruefung insgesamt weniger als 3 sichere Hauptgerichte vorhanden sind.",
      "- Erfinde nichts.",
      "- Nutze nur echte Gerichte aus der Speisekarte."
    ]
  };
}

function toSearchTargetLabel(value: string) {
  const normalized = normalizePreference(value);

  if (normalized.includes("pizza")) return "Pizzen";
  if (/\b(?:pasta|nudel|nudeln|spaghetti|tagliatelle|linguine|penne|rigatoni|gnocchi)\b/.test(normalized)) {
    return "Pasta- oder Nudelgerichte";
  }
  if (/\b(?:salat|salate|salad|salads)\b/.test(normalized)) {
    return "Salate oder salatnahe eigenstaendige Hauptgerichte";
  }
  if (/\b(?:fleisch|meat|rind|kalb|schwein|gefluegel|geflugel|huhn|haehnchen|hahnchen|lamm|steak)\b/.test(normalized)) {
    return "Fleischgerichte";
  }
  if (/\b(?:fisch|fish|seafood|meeresfruechte|meeresfruchte|garnelen|scampi|lachs|thunfisch)\b/.test(normalized)) {
    return "Fischgerichte oder Seafood";
  }
  if (/\b(?:vegetarisch|vegetarian|veggie)\b/.test(normalized)) {
    return "vegetarische Gerichte";
  }
  if (/\b(?:gemuese|gemuse|vegetable|vegetables)\b/.test(normalized)) {
    return "gemuesebasierte Gerichte";
  }
  if (/\b(?:ei|eier|egg|eggs|uovo|uova|oeuf|oeufs|huevo|huevos)\b/.test(normalized)) {
    return "eibasierte Gerichte";
  }
  if (/\b(?:kaese|kase|cheese|formaggio)\b/.test(normalized)) {
    return "kaesebetonte Hauptgerichte";
  }

  return value.trim();
}

function joinSearchTargets(values: string[]) {
  if (values.length <= 1) return values[0] ?? "aktive Vorlieben";
  if (values.length === 2) return `${values[0]} oder ${values[1]}`;

  return `${values.slice(0, -1).join(", ")} oder ${values[values.length - 1]}`;
}

function arrayValue(values?: string[]) {
  return Array.isArray(values) ? values.filter((value) => value.trim().length > 0) : [];
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizePreference(item) === normalizePreference(value)) ? result : [...result, value];
  }, []);
}

function normalizePreference(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function listOrNone(values: string[]) {
  return values.length > 0 ? values.join(", ") : "keine";
}
