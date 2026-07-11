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
  type MainDishAIRecommendation,
  type TwoStepMenuSourceInput
} from "./twoStepRecommendationSchemas";

export async function recommendMainDishesAI({
  source,
  profile,
  situation,
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
  situation?: Situation;
  userLocale?: string;
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

  return parsed.recommendations;
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
    "Aufgabe: Finde genau 3 echte Hauptgerichte aus der Speisekarte, die alle harten Profilwerte respektieren und moeglichst gut zu den Vorlieben und zur Situation passen.",
    "Wenn weniger als 3 sichere passende Hauptgerichte vorhanden sind, liefere nur die sicheren passenden Gerichte.",
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
    "- Empfiehl kein Gericht mit bekanntem oder sichtbarem Profilkonflikt.",
    "- Wenn ein harter Konflikt nicht sicher ausgeschlossen werden kann, empfehle das Gericht nicht.",
    "- Wenn Sahne, Rahm, Cream oder Panna in Ausschluessen, Unvertraeglichkeiten oder Allergenen aktiv ist: kein Gericht mit Sahne, Sahnesosse, Sahnesauce, Rahm, Cream, Cream sauce oder Panna empfehlen.",
    "- Beispiel Modo Mio: Spaghetti al Tartufo mit Pecorino-Trueffel-Sahnesauce darf bei Ausschluss Sahne nicht empfohlen werden.",
    "- Nutze nur echte Hauptgerichte, die belegbar in der Speisekarte vorkommen.",
    "- Keine Vorspeisen, Desserts, Getraenke, Beilagen, Zutaten oder Beschreibungsteile als Hauptgericht empfehlen.",
    "- Wenn ein Risiko in einem gelieferten Ergebnis erkannt wird, muss profileSafety dies korrekt markieren.",
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
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Kopiere nameOriginal nicht einfach als translatedName, wenn der Originalname fremdsprachig ist.",
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
    '        "conflictReason": null',
    "      }",
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function buildMainDishProfileContext(
  profile: UserProfile,
  situation: Situation | undefined,
  positivePreferences: string[],
  searchAssignment: ActivePreferenceSearchAssignment
) {
  const hardExclusions = uniqueValues([
    ...arrayValue(profile.dislikes),
    ...arrayValue(profile.customExclusions)
  ]);
  const hardIntolerances = uniqueValues([
    ...arrayValue(profile.intolerances),
    ...arrayValue(profile.customIntolerances)
  ]);
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));
  return [
    "Nutzerprofil fuer diesen Main-AI-Call:",
    `- Ausgabesprache nur fuer nutzerseitige Texte, kein Auswahlkriterium: ${profile.outputLocale || "de-DE"}`,
    `- Aktuelle Essenssituation/Modus: ${situation || profile.appetiteMood || "nicht angegeben"}`,
    `- Anzahl aktiver heutiger Vorlieben/Wunschrichtungen: ${positivePreferences.length}`,
    `- Aktive heutige Vorlieben/Wunschrichtungen: ${listOrNone(positivePreferences)}`,
    `- Aktiver Suchauftrag: ${searchAssignment.instruction}`,
    `- Aktiver Suchraum: ${searchAssignment.searchSpaceLabel}`,
    `- Aktive harte Abneigungen/Ausschluesse: ${listOrNone(hardExclusions)}`,
    `- Aktive Unvertraeglichkeiten: ${listOrNone(hardIntolerances)}`,
    `- Aktive Allergene: ${listOrNone(hardAllergens)}`,
    "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten sind wichtiger als Vorlieben und Situation.",
    "- Bei harten Ausschluessen, Allergien und Unvertraeglichkeiten gilt: Wenn unsicher, nicht empfehlen.",
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
  const hardExclusions = uniqueValues([
    ...arrayValue(profile.dislikes),
    ...arrayValue(profile.customExclusions)
  ]);
  const hardIntolerances = uniqueValues([
    ...arrayValue(profile.intolerances),
    ...arrayValue(profile.customIntolerances)
  ]);
  const hardAllergens = uniqueValues(arrayValue(profile.allergens));

  return {
    analyse: {
      profil: {
        vorlieben: activePreferences,
        ausschluesse_und_unvertraeglichkeiten: uniqueValues([
          ...hardExclusions,
          ...hardIntolerances
        ]),
        allergene: hardAllergens,
        ausgabesprache: targetLocale
      },
      situation: {
        modus: situation || profile.appetiteMood || "nicht angegeben"
      },
      regeln: {
        anzahl_gerichte: 3,
        harte_ausschluesse_sind_verbindlich: true,
        allergene_sind_verbindlich: true,
        unvertraeglichkeiten_sind_verbindlich: true,
        vorlieben_sind_positive_orientierung: true,
        vorlieben_duerfen_harte_ausschluesse_nicht_ueberstimmen: true,
        nur_speisekarteninformationen: true,
        beschreibung_nur_wenn_vorhanden: true,
        keine_beschreibung_erfinden: true,
        keine_nachgelagerte_qualitaetskontrolle: true,
        kein_pdf_fuzzy_matching: true
      },
      suchauftrag: {
        instruktion: searchAssignment.instruction,
        suchraum: searchAssignment.searchSpaceLabel
      },
      speisekarte: "siehe Quellenkontext/Speisekartentext oder angehaengte Speisekartendateien"
    },
    auftrag: "Finde genau 3 Hauptgerichte aus der Speisekarte, die alle harten Ausschluesse, Allergene und Unvertraeglichkeiten respektieren und moeglichst gut zu den Vorlieben und zur Situation passen."
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
      instruction: "Empfiehl bis zu 3 passende Hauptgerichte aus dieser Speisekarte.",
      searchSpaceLabel: "allgemeine passende Hauptgerichte",
      rules: [
        "- Es gibt keine aktive Wunschrichtung; waehle bis zu 3 passende echte Hauptgerichte aus der Speisekarte.",
        "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten bleiben verbindlich."
      ]
    };
  }

  if (values.length === 1) {
    const searchTarget = toSearchTargetLabel(values[0]!);

    return {
      kind: "single",
      instruction: `Empfiehl bis zu 3 Gerichte aus dem aktiven Suchraum: ${searchTarget}.`,
      searchSpaceLabel: searchTarget,
      rules: [
        `- Wenn die Speisekarte genuegend passende ${searchTarget} enthaelt, muessen alle Empfehlungen ${searchTarget} sein.`,
        `- Wenn weniger passende ${searchTarget} sicher erkennbar sind, liefere weniger Empfehlungen.`,
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
    instruction: `Empfiehl bis zu 3 Gerichte aus dem aktiven Suchraum: ${searchSpace}.`,
    searchSpaceLabel: searchSpace,
    rules: [
      "- Empfehlungen muessen aus diesem Suchraum stammen, wenn passende Gerichte vorhanden sind.",
      "- Fuelle nicht mit neutralen Kategorien ausserhalb des Suchraums auf.",
      "- Wenn nur weniger sichere Treffer im Suchraum erkennbar sind, liefere weniger Empfehlungen.",
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
