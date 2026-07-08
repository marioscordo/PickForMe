import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { UserProfile } from "../types/profile";
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
  userLocale,
  signal
}: {
  source: TwoStepMenuSourceInput;
  profile: UserProfile;
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
  targetLocale,
  targetLanguage
}: {
  profile: UserProfile;
  targetLocale: string;
  targetLanguage: string;
}) {
  const activePreferences = getActivePreferenceValues(profile);
  const searchAssignment = buildActivePreferenceSearchAssignment(activePreferences);

  return [
    "Du bist GustaroAI in der neuen 2+2-AI-Architektur.",
    "Du bist kein Speisekartenparser.",
    "Liefere nur die benoetigten Hauptgericht-Empfehlungen, nicht die komplette Speisekarte.",
    "Aufgabe: Erfuelle den verbindlichen Suchauftrag mit echten Hauptspeisen aus der Speisekarte.",
    `Sprache fuer nutzerseitige Ausgaben: ${targetLanguage} (${targetLocale}).`,
    "",
    "Der folgende Suchauftrag ist verbindlich:",
    searchAssignment.instruction,
    "",
    "Verbindliche Regeln:",
    ...searchAssignment.rules,
    "- Das aktive Nutzerprofil muss beruecksichtigt werden.",
    "- Gruende muessen profilbezogen sein.",
    "- Erfinde nichts.",
    "- Nutze nur Gerichte, die belegbar in der Speisekarte vorkommen.",
    "- Keine Vorspeisen, Desserts, Getraenke, Beilagen, Zutaten oder Beschreibungsteile.",
    "- Allergien, Unvertraeglichkeiten, Abneigungen und harte Profilregeln sind verbindliche Ausschluesse.",
    "- Empfiehl kein Gericht mit bekanntem Profilkonflikt.",
    "- Wenn bei Allergie oder Unvertraeglichkeit nicht sicher ausgeschlossen werden kann, dass ein Gericht problematisch ist: nicht empfehlen.",
    "- Wenn ein Risiko in einem gelieferten Ergebnis erkannt wird, muss profileSafety dies korrekt markieren.",
    "- Ein Gericht darf nicht wegen fehlendem Preis ausgeschlossen werden.",
    "- priceRaw ist optional und darf null oder fehlen.",
    "- sourceEvidence soll geliefert werden, wenn ein kurzer Beleg sicher moeglich ist.",
    "- sourceEvidence darf null oder fehlen, wenn kein knapper Beleg sicher angegeben werden kann.",
    "- translatedName ist Pflicht und ist die nutzerseitige Anzeigeuebersetzung in der Zielsprache.",
    `- translatedName muss in ${targetLanguage} (${targetLocale}) formuliert sein.`,
    "- Bei de-DE muss translatedName eine deutsche Anzeigeuebersetzung oder ein deutscher, fuer Nutzer verstaendlicher Gloss sein.",
    "- Kopiere nameOriginal nicht einfach als translatedName, wenn der Originalname fremdsprachig ist.",
    "- Eigennamen oder unveraenderliche Gerichtstitel duerfen teilweise erhalten bleiben, aber translatedName muss trotzdem in der Zielsprache verstaendlich sein.",
    "- Uebersetze nur, was durch sourceEvidence oder Speisekartentext belegbar ist.",
    "- Erfinde keine Zutaten und fuege keine freien Ausschmueckungen hinzu.",
    "- Wenn weniger als 3 sichere Hauptgerichte existieren, liefere weniger.",
    "",
    ...buildMainDishQualityRules(searchAssignment),
    "",
    buildMainDishProfileContext(profile, activePreferences, searchAssignment),
    "",
    "Antwort ausschliesslich als valides JSON ohne Markdown:",
    "{",
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "nameOriginal": "exakter Originalname aus der Speisekarte",',
    '      "translatedName": "display-sichere nutzerseitige Anzeigeuebersetzung in der Zielsprache",',
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

function buildMainDishQualityRules(searchAssignment: ActivePreferenceSearchAssignment) {
  return [
    "Auswahlgewichtung fuer das aktive Profil:",
    "- Das aktive Nutzerprofil ist nicht dekorativ, sondern verbindliches Auswahlkriterium.",
    "- Das Profil steuert, WAS empfohlen wird.",
    searchAssignment.kind === "none"
      ? "- Es gibt keine aktive Wunschrichtung; waehle passende sichere Hauptgerichte aus der Speisekarte."
      : "- Aktive Vorlieben bilden den Suchraum dieses Calls, nicht nur weichen Kontext.",
    searchAssignment.kind === "none"
      ? "- Ohne aktive Wunschrichtung nicht kuenstlich eine Kategorie erzwingen."
      : `- Der aktive Suchraum lautet: ${searchAssignment.searchSpaceLabel}.`,
    searchAssignment.kind === "single"
      ? "- Genau eine aktive Vorliebe ist gesetzt; diese Vorliebe ist die exklusive Suchrichtung fuer alle Empfehlungen, solange sichere Treffer in der Quelle erkennbar sind."
      : "- Wenn mehrere aktive Vorlieben gesetzt sind, bilden diese Vorlieben gemeinsam den erlaubten Suchraum.",
    searchAssignment.kind === "single"
      ? "- Wenn im Suchraum mindestens 3 sichere passende eigenstaendige Hauptgerichte erkennbar sind, muessen alle 3 Empfehlungen aus diesem Suchraum stammen."
      : "- Wenn im Suchraum genug sichere passende eigenstaendige Hauptgerichte erkennbar sind, muessen die Empfehlungen aus diesem Suchraum stammen.",
    searchAssignment.kind === "single"
      ? "- Wenn im Suchraum nur 2 sichere Treffer erkennbar sind, liefere nur 2 Empfehlungen; wenn nur 1 sicherer Treffer erkennbar ist, liefere nur 1 Empfehlung."
      : "- Wenn im Suchraum weniger sichere Treffer erkennbar sind, liefere weniger Empfehlungen.",
    "- Nicht mit neutralen Kategorien ausserhalb des aktiven Suchraums auffuellen.",
    "- Keine fremden Kategorien als Ersatzempfehlungen verwenden, solange passende sichere Gerichte im Suchraum vorhanden sind.",
    "- Beispiele fuer aktive positive Vorlieben: Salat, Pasta, Pizza, vegetarische Gerichte, Gemuesegerichte, Fleisch, Fisch, Ei, Kaese oder andere aktuell genannte Speisen/Kategorien.",
    "- Empfiehl nicht stattdessen prominente Fleisch-, Fisch-, Pasta-, Risotto- oder Gnocchi-Gerichte nur, weil sie klassisch, teuer, beliebt oder auffaellig sind, wenn sie ausserhalb des aktiven Suchraums liegen.",
    "- Aktive harte Abneigungen, Ausschluesse, Allergien und Unvertraeglichkeiten sind dagegen verbindliche Tabus.",
    "- Wenn aktiver Suchraum und harte Ausschluesse zusammenwirken, waehle nur Gerichte aus dem Suchraum, die keinen harten Konflikt haben.",
    "- Beispiel: Bei aktivem Suchraum Pizza oder Salat zuerst Pizza- und Salatgerichte pruefen; Fleisch ist nicht profilhart verboten, aber nicht Teil dieses Suchauftrags.",
    "- Beispiel: Wenn Pizza die einzige aktive Essensvorliebe ist und mindestens 3 sichere Pizza-Gerichte sichtbar sind, muessen alle Empfehlungen Pizza-Gerichte sein.",
    "- Beispiel: Wenn Pizza die einzige aktive Essensvorliebe ist und nur 2 sichere Pizza-Gerichte sichtbar sind, liefere nur diese 2 Pizza-Gerichte.",
    "- Beispiel: Wenn Pizza die einzige aktive Essensvorliebe ist und nur 1 sichere Pizza erkennbar ist, liefere nur 1 Pizza statt neutraler Auffueller.",
    "- Beispiel: Wenn Pizza die einzige aktive Essensvorliebe ist und genug sichere Pizza-Gerichte sichtbar sind, sind 2 x Pizza + 1 x Salat falsch.",
    "- Beispiel: Wenn Pizza die einzige aktive Essensvorliebe ist und genug sichere Pizza-Gerichte sichtbar sind, sind 2 x Pasta/Nudeln + 1 x Pizza falsch.",
    "- Beispiel: Wenn Pizza die einzige aktive Essensvorliebe ist und genug sichere Pizza-Gerichte sichtbar sind, ist Saltimbocca falsch.",
    "- Liefere lieber weniger Empfehlungen als drei Empfehlungen, die keine aktive Vorliebe erfuellen.",
    "- Wenn keine Empfehlung aus einer aktiven Vorliebe stammt, muss die reason erklaeren, warum keine sichere passende Option aus der aktiven Vorliebe erkennbar war.",
    "- Bei genau einer aktiven Vorliebe darf eine neutrale Empfehlung nicht allgemein mit 'beliebt', 'klassisch' oder 'passt gut' begruendet werden.",
    "- Bei genau einer aktiven Vorliebe muss jede gelieferte Empfehlung in der reason erklaeren, wie sie diese aktive Vorliebe erfuellt.",
    "- Bei genau einer aktiven Vorliebe darf eine Empfehlung, die diese Vorliebe nicht erfuellt, nicht geliefert werden, wenn sichere passende Gerichte aus der Vorliebe vorhanden sind.",
    "- reason muss kurz erklaeren, welches aktive Suchziel erfuellt wird und warum das Gericht innerhalb des Suchraums passt.",
    "- reason darf keine technischen Profilbegriffe erwaehnen.",
    "- Schlechte reasons sind allgemeine Aussagen wie 'Klassiker des Hauses', 'beliebt' oder 'hochwertig', wenn sie den aktiven Suchraum nicht sichtbar beruecksichtigen.",
    "- profileSafety bleibt fuer harte Ausschluesse, Allergien, Unvertraeglichkeiten und echte bekannte Konflikte reserviert.",
    "- Reine aktive Vorlieben sind Auswahlpraeferenzen, aber kein Safety-Konflikt.",
    "- Setze profileSafety.hasKnownConflict oder uncertainForAllergy nur, wenn die bestehende Safety-Semantik wirklich passt."
  ];
}

function buildMainDishProfileContext(
  profile: UserProfile,
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
  return [
    "Nutzerprofil fuer diesen Main-AI-Call:",
    `- Ausgabesprache nur fuer nutzerseitige Texte, kein Auswahlkriterium: ${profile.outputLocale || "de-DE"}`,
    `- Anzahl aktiver heutiger Vorlieben/Wunschrichtungen: ${positivePreferences.length}`,
    `- Aktive heutige Vorlieben/Wunschrichtungen: ${listOrNone(positivePreferences)}`,
    `- Aktiver Suchauftrag: ${searchAssignment.instruction}`,
    `- Aktiver Suchraum: ${searchAssignment.searchSpaceLabel}`,
    `- Aktive harte Abneigungen/Ausschluesse: ${listOrNone(hardExclusions)}`,
    `- Aktive Allergien/Unvertraeglichkeiten: ${listOrNone(hardIntolerances)}`,
    "- Harte Ausschluesse, Allergien und Unvertraeglichkeiten sind wichtiger als Vorlieben.",
    "- Bei harten Ausschluessen, Allergien und Unvertraeglichkeiten gilt: Wenn unsicher, nicht empfehlen.",
    "- Aktive Vorlieben definieren den Suchraum fuer diesen Empfehlungslauf.",
    "- Diese Signale stammen aus dem aktuellen Request-Profil und duerfen nicht aus frueheren Analysen ersetzt werden."
  ].join("\n");
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
