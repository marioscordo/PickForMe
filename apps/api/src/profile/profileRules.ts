import type { AppetiteMood, UserProfile } from "../types/profile";

type ProfileInput = Partial<UserProfile>;

type CanonicalRuleId =
  | "NO_PORK"
  | "NO_ALCOHOL"
  | "NO_BEEF"
  | "NO_LAMB"
  | "NO_SEAFOOD"
  | "NO_MUSHROOMS"
  | "NO_CILANTRO"
  | "NO_OFFAL"
  | "NO_BONY_FISH"
  | "LACTOSE_SENSITIVE"
  | "GLUTEN_SENSITIVE"
  | "NUT_SENSITIVE"
  | "EGG_SENSITIVE"
  | "SOY_SENSITIVE"
  | "CELERY_SENSITIVE"
  | "FRUCTOSE_SENSITIVE"
  | "HISTAMINE_SENSITIVE"
  | "DIET_VEGETARIAN"
  | "DIET_VEGAN";

type CanonicalRule = {
  id: CanonicalRuleId;
  source: string;
};

type TextRecommendationInput = {
  nameOriginal?: string;
  descriptionOriginal?: string;
  category?: string;
  sourceLine?: string;
  evidence?: string;
};

type DishInput = {
  nameOriginal?: string;
  descriptionOriginal?: string;
  category?: string;
  sourceLine?: string;
  price?: number;
};

const STOP_WORDS = new Set([
  "kein",
  "keine",
  "keinen",
  "ohne",
  "nicht",
  "im",
  "in",
  "mit",
  "und",
  "oder",
  "als",
  "bei",
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "essen",
  "gericht",
  "gerichte"
]);

export function buildProfilePromptLines(profile: ProfileInput = {}, situation?: string) {
  const primaryLikes = arrayValue(profile.primaryLikes);
  const secondaryLikes = arrayValue(profile.secondaryLikes);
  const dislikes = arrayValue(profile.dislikes);
  const intolerances = arrayValue(profile.intolerances);
  const exceptions = arrayValue(profile.exceptions);
  const canonicalRules = deriveCanonicalRules(profile);

  return [
    "Nutzerprofil:",
    `Name: ${profile.displayName || "Gast"}`,
    `Ernaehrungsstil: ${profile.dietStyle || "normal"}`,
    `Aktive starke Vorlieben: ${listOrNone(primaryLikes)}`,
    `Aktive weitere Vorlieben: ${listOrNone(secondaryLikes)}`,
    `Aktive harte Ausschluesse / Abneigungen: ${listOrNone(dislikes)}`,
    `Aktive Allergien / Unvertraeglichkeiten: ${listOrNone(intolerances)}`,
    `Aktive Ausnahmen zu Ausschluessen: ${listOrNone(exceptions)}`,
    `Ess-Stimmung: ${describeAppetiteMood(profile.appetiteMood)}`,
    `Aktuelle Situation: ${situation || "nicht angegeben"}`,
    "",
    "Semantische Profilregeln:",
    canonicalRules.length > 0
      ? canonicalRules.map((rule) => `- ${rule.id}: ${semanticRuleDescription(rule.id)} Quelle: ${rule.source}`).join("\n")
      : "- keine aktiven semantischen Hard Rules",
    "",
    ...buildFeedbackPromptLines(profile),
    "",
    "Verbindliche Auswertung:",
    "- Die semantischen Profilregeln sind wichtiger als Vorlieben.",
    "- Bei harten Ausschluessen, Allergien und Unvertraeglichkeiten gilt: Wenn unsicher, nicht empfehlen.",
    "- Ausnahmen gelten nur, wenn das konkrete Gericht klar zur Ausnahme passt.",
    "- Vorlieben beeinflussen nur die Reihenfolge sicherer Gerichte.",
    "- Inaktive gespeicherte Profiloptionen zaehlen nicht. Aktiv sind nur die oben genannten Werte."
  ];
}

export function blockReasonForDish(dish: DishInput, profile: ProfileInput) {
  return blockReasonForText(dishToText(dish), profile);
}

export function blockReasonForRecommendation(recommendation: TextRecommendationInput, profile: ProfileInput) {
  return blockReasonForText(
    [
      recommendation.nameOriginal,
      recommendation.descriptionOriginal,
      recommendation.category,
      recommendation.sourceLine,
      recommendation.evidence
    ]
      .filter(Boolean)
      .join(" "),
    profile
  );
}

export function preferenceMatchesDish(dish: DishInput, preference: string) {
  const text = normalizeForMatching(dishToText(dish));
  const value = normalizeForMatching(preference);

  if (!value) {
    return false;
  }

  if (value.includes("guenstig") || value.includes("gunstig")) {
    return typeof dish.price === "number" && dish.price > 0 && dish.price <= 16;
  }

  return preferenceTerms(preference).some((term) => textHasTerm(text, term));
}

export function appetiteMoodScoreForDish(dish: DishInput, mood?: AppetiteMood) {
  const text = normalizeForMatching(dishToText(dish));

  if (!mood) return 0;

  if (mood === "richtig_hunger") {
    return hasAnyTerm(text, ["braten", "steak", "burger", "pasta", "curry", "pfanne", "platte", "haehnchen", "rind", "lamm"])
      ? 5
      : 0;
  }

  if (mood === "leicht") {
    return hasAnyTerm(text, ["salat", "gemuese", "fisch", "lachs", "bowl", "suppe", "gegrillt"])
      ? 5
      : 0;
  }

  if (mood === "neues_probieren") {
    return hasAnyTerm(text, ["spezial", "hausgemacht", "variation", "chef", "signature", "tempura", "curry"])
      ? 4
      : 0;
  }

  if (mood === "sicher") {
    return hasAnyTerm(text, ["schnitzel", "pizza", "pasta", "burger", "salat", "steak", "braten", "klassisch"])
      ? 4
      : 0;
  }

  return 0;
}

function blockReasonForText(rawText: string, profile: ProfileInput) {
  const text = normalizeForMatching(rawText);

  if (!text) {
    return undefined;
  }

  if (matchesActiveException(text, profile)) {
    return undefined;
  }

  for (const rule of deriveCanonicalRules(profile)) {
    if (canonicalRuleBlocks(rule.id, text)) {
      return `Blockiert durch semantische Profilregel: ${rule.id}`;
    }
  }

  for (const rawRule of rawRulesWithoutCanonicalMeaning(profile)) {
    if (rawRuleMatchesText(rawRule, text)) {
      return `Blockiert durch Profilregel: ${rawRule}`;
    }
  }

  return undefined;
}

function deriveCanonicalRules(profile: ProfileInput): CanonicalRule[] {
  const activeRules = uniqueValues([
    ...arrayValue(profile.dislikes),
    ...arrayValue(profile.intolerances)
  ]);

  const canonicalRules: CanonicalRule[] = [];

  for (const source of activeRules) {
    const id = classifyRule(source);

    if (id && !canonicalRules.some((rule) => rule.id === id)) {
      canonicalRules.push({ id, source });
    }
  }

  if (profile.dietStyle === "vegetarisch") {
    canonicalRules.push({ id: "DIET_VEGETARIAN", source: "vegetarisch" });
  }

  if (profile.dietStyle === "vegan") {
    canonicalRules.push({ id: "DIET_VEGAN", source: "vegan" });
  }

  return canonicalRules;
}

function rawRulesWithoutCanonicalMeaning(profile: ProfileInput) {
  return uniqueValues([
    ...arrayValue(profile.dislikes),
    ...arrayValue(profile.intolerances)
  ]).filter((rule) => !classifyRule(rule));
}

function classifyRule(rule: string): CanonicalRuleId | undefined {
  const value = normalizeForMatching(rule);

  if (value.includes("schwein") || value.includes("pork")) return "NO_PORK";
  if (value.includes("alkohol")) return "NO_ALCOHOL";
  if (value.includes("rind")) return "NO_BEEF";
  if (value.includes("lamm")) return "NO_LAMB";
  if (value.includes("meeresfrucht")) return "NO_SEAFOOD";
  if (value.includes("pilz")) return "NO_MUSHROOMS";
  if (value.includes("koriander")) return "NO_CILANTRO";
  if (value.includes("innerei") || value.includes("leber")) return "NO_OFFAL";
  if (value.includes("graetenfisch") || value.includes("gratenfisch")) return "NO_BONY_FISH";
  if (value.includes("laktose")) return "LACTOSE_SENSITIVE";
  if (value.includes("gluten")) return "GLUTEN_SENSITIVE";
  if (value.includes("nuss") || value.includes("nuesse") || value.includes("nusse")) return "NUT_SENSITIVE";
  if (value === "ei") return "EGG_SENSITIVE";
  if (value.includes("soja")) return "SOY_SENSITIVE";
  if (value.includes("sellerie")) return "CELERY_SENSITIVE";
  if (value.includes("fructose") || value.includes("fruktose")) return "FRUCTOSE_SENSITIVE";
  if (value.includes("histamin")) return "HISTAMINE_SENSITIVE";

  return undefined;
}

function canonicalRuleBlocks(rule: CanonicalRuleId, text: string): boolean {
  if (rule === "NO_PORK") {
    return hasAnyTerm(text, ["schwein", "pork"]) || isAmbiguousPorkRisk(text);
  }

  if (rule === "NO_ALCOHOL") {
    return hasAnyTerm(text, ["alkohol", "wein", "bier", "rum", "cognac"]);
  }

  if (rule === "NO_BEEF") {
    return hasAnyTerm(text, ["rind", "beef"]);
  }

  if (rule === "NO_LAMB") {
    return hasAnyTerm(text, ["lamm"]);
  }

  if (rule === "NO_SEAFOOD") {
    return hasAnyTerm(text, ["meeresfrucht", "garnele", "scampi", "muschel", "calamari", "tintenfisch", "oktopus", "hummer", "krabbe", "krebs"]);
  }

  if (rule === "NO_MUSHROOMS") {
    return hasAnyTerm(text, ["pilz", "champignon"]);
  }

  if (rule === "NO_CILANTRO") {
    return hasAnyTerm(text, ["koriander", "cilantro"]);
  }

  if (rule === "NO_OFFAL") {
    return hasAnyTerm(text, ["innerei", "leber", "niere", "kutteln"]);
  }

  if (rule === "NO_BONY_FISH") {
    return isFishWithBoneRisk(text);
  }

  if (rule === "LACTOSE_SENSITIVE") {
    return hasAnyTerm(text, ["milch", "sahne", "kaese", "butter", "joghurt", "rahm"]);
  }

  if (rule === "GLUTEN_SENSITIVE") {
    return hasAnyTerm(text, ["weizen", "mehl", "panade", "paniert", "brot", "nudeln", "pasta", "pizza"]);
  }

  if (rule === "NUT_SENSITIVE") {
    return hasAnyTerm(text, ["nuss", "mandel", "erdnuss", "pistazie", "walnuss", "cashew", "haselnuss"]);
  }

  if (rule === "EGG_SENSITIVE") {
    return hasAnyTerm(text, ["ei", "eier", "omelett", "mayonnaise"]);
  }

  if (rule === "SOY_SENSITIVE") {
    return hasAnyTerm(text, ["soja", "tofu"]);
  }

  if (rule === "CELERY_SENSITIVE") {
    return hasAnyTerm(text, ["sellerie"]);
  }

  if (rule === "FRUCTOSE_SENSITIVE") {
    return hasAnyTerm(text, ["fructose", "fruktose", "obst", "apfel", "birne", "honig", "frucht"]);
  }

  if (rule === "HISTAMINE_SENSITIVE") {
    return hasAnyTerm(text, [
      "histamin",
      "wein",
      "salami",
      "speck",
      "schinken",
      "gereift",
      "fermentiert",
      "fisch",
      "thunfisch",
      "lachs",
      "sushi",
      "sashimi",
      "seafood",
      "meeresfrucht",
      "garnele",
      "scampi",
      "muschel"
    ]);
  }

  if (rule === "DIET_VEGETARIAN") {
    return hasAnyTerm(text, ["fleisch", "rind", "schwein", "huhn", "haehnchen", "ente", "lamm", "fisch", "lachs", "meeresfrucht", "garnele"]);
  }

  if (rule === "DIET_VEGAN") {
    return (
      canonicalRuleBlocks("DIET_VEGETARIAN", text) ||
      hasAnyTerm(text, ["ei", "milch", "sahne", "kaese", "butter", "joghurt", "honig"])
    );
  }

  return false;
}

function isAmbiguousPorkRisk(text: string) {
  const genericMeatRisk = hasAnyTerm(text, ["schnitzel", "braten", "wurst", "hack", "frikadelle"]);
  const clearlyNotPork = hasAnyTerm(text, ["rind", "beef", "kalb", "veal", "huhn", "haehnchen", "chicken", "pute", "fisch", "lachs", "tofu", "vegetarisch", "vegan"]);

  return genericMeatRisk && !clearlyNotPork;
}

function isFishWithBoneRisk(text: string) {
  const fish = hasAnyTerm(text, ["fisch", "forelle", "dorade", "karpfen", "wolfsbarsch"]);
  const clearlyLowRisk = hasAnyTerm(text, ["filet", "filetiert", "graetenfrei", "gratenfrei"]);

  return fish && !clearlyLowRisk;
}

function preferenceTerms(preference: string) {
  const value = normalizeForMatching(preference);

  if (value.includes("fleisch")) {
    return ["fleisch", "rind", "schwein", "huhn", "haehnchen", "ente", "lamm", "steak", "schnitzel", "braten"];
  }

  if (value.includes("fisch")) {
    return ["fisch", "lachs", "thunfisch", "zander", "dorade"];
  }

  if (value.includes("protein")) {
    return ["protein", "rind", "steak", "haehnchen", "huhn", "fisch", "lachs", "thunfisch", "ei", "tofu", "linsen", "bohnen"];
  }

  if (value.includes("scharf")) {
    return ["scharf", "chili", "peperoni", "pikant", "curry"];
  }

  if (value.includes("portion")) {
    return ["platte", "pfanne", "teller", "schnitzel", "burger", "steak", "braten", "pasta", "curry", "bowl"];
  }

  return meaningfulTokens(preference);
}

function matchesActiveException(normalizedText: string, profile: ProfileInput) {
  return arrayValue(profile.exceptions).some((exception) => exceptionMatchesText(exception, normalizedText));
}

function exceptionMatchesText(exception: string, normalizedText: string) {
  const normalizedException = normalizeForMatching(exception);
  const tokens = meaningfulTokens(exception);

  if (!normalizedException || tokens.length === 0) {
    return false;
  }

  return normalizedText.includes(normalizedException) || tokens.every((token) => textHasTerm(normalizedText, token));
}

function rawRuleMatchesText(rule: string, normalizedText: string) {
  const normalizedRule = normalizeForMatching(rule);
  const tokens = meaningfulTokens(rule);

  if (!normalizedRule || tokens.length === 0) {
    return false;
  }

  return normalizedText.includes(normalizedRule) || tokens.every((token) => textHasTerm(normalizedText, token));
}

function semanticRuleDescription(rule: CanonicalRuleId) {
  if (rule === "NO_PORK") return "kein Gericht mit Schweinefleisch oder unklarem pork-plausiblem Fleischanteil";
  if (rule === "NO_ALCOHOL") return "kein Gericht mit Alkohol im Essen";
  if (rule === "NO_BEEF") return "kein Gericht mit Rindfleisch";
  if (rule === "NO_LAMB") return "kein Gericht mit Lamm";
  if (rule === "NO_SEAFOOD") return "keine Meeresfruechte";
  if (rule === "NO_MUSHROOMS") return "keine Pilze";
  if (rule === "NO_CILANTRO") return "kein Koriander";
  if (rule === "NO_OFFAL") return "keine Innereien";
  if (rule === "NO_BONY_FISH") return "kein Fisch mit erkennbarem Graetenrisiko";
  if (rule === "LACTOSE_SENSITIVE") return "Laktose streng beruecksichtigen";
  if (rule === "GLUTEN_SENSITIVE") return "Gluten streng beruecksichtigen";
  if (rule === "NUT_SENSITIVE") return "Nuesse streng beruecksichtigen";
  if (rule === "EGG_SENSITIVE") return "Ei streng beruecksichtigen";
  if (rule === "SOY_SENSITIVE") return "Soja streng beruecksichtigen";
  if (rule === "CELERY_SENSITIVE") return "Sellerie streng beruecksichtigen";
  if (rule === "FRUCTOSE_SENSITIVE") return "Fructose streng beruecksichtigen";
  if (rule === "HISTAMINE_SENSITIVE") return "Histaminrisiko streng beruecksichtigen; bei Fisch, Seafood, rohem Fisch, gereiften/fermentierten Produkten und Alkohol im Zweifel nicht empfehlen";
  if (rule === "DIET_VEGETARIAN") return "vegetarisch";
  if (rule === "DIET_VEGAN") return "vegan";

  return "aktive Profilregel";
}

function hasAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => textHasTerm(text, normalizeForMatching(term)));
}

function textHasTerm(text: string, term: string) {
  if (!term) return false;

  if (term.length <= 2) {
    const escaped = escapeRegExp(term);
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
  }

  return text.includes(term);
}

function dishToText(dish: DishInput) {
  return [dish.nameOriginal, dish.descriptionOriginal, dish.category, dish.sourceLine]
    .filter(Boolean)
    .join(" ");
}

function describeAppetiteMood(mood?: AppetiteMood) {
  if (mood === "richtig_hunger") return "Richtig Hunger - saettigend, kraeftig, gern proteinreich";
  if (mood === "leicht") return "Etwas Leichtes - nicht zu schwer, frisch, leicht verdaulich";
  if (mood === "neues_probieren") return "Etwas Neues probieren - offen fuer besondere Gerichte";
  if (mood === "sicher") return "Auf Nummer sicher gehen - vertraut, klassisch, risikoarm";
  return "nicht angegeben";
}

function listOrNone(values: string[]) {
  return values.length > 0 ? values.join(", ") : "keine Angabe";
}

function arrayValue(values?: string[]) {
  return Array.isArray(values) ? values.filter((value) => value.trim().length > 0) : [];
}

function meaningfulTokens(value: string) {
  return normalizeForMatching(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token));
}

function normalizeForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9€]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeForMatching(item) === normalizeForMatching(value)) ? result : [...result, value];
  }, []);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}




type RecommendationFeedbackInput = {
  dishNameOriginal: string;
  translatedName?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  accepted: boolean;
  createdAt: string;
};

type ProfileInputWithFeedback = ProfileInput & {
  recommendationFeedback?: RecommendationFeedbackInput[];
};

function buildFeedbackPromptLines(profile: ProfileInput): string[] {
  const feedback = (profile as ProfileInputWithFeedback).recommendationFeedback ?? [];

  if (feedback.length === 0) {
    return [];
  }

  const recentFeedback = feedback
    .slice(-12)
    .map((item: RecommendationFeedbackInput) => {
      const name = item.translatedName
        ? `${item.dishNameOriginal} (${item.translatedName})`
        : item.dishNameOriginal;

      const signal =
        item.rating >= 4
          ? "positives Signal"
          : item.rating <= 2
            ? "negatives Signal"
            : "neutrales Signal";

      return `- ${name}: ${item.rating}/5 Sterne, ${signal}`;
    });

  return [
    "",
    "Persoenliche Feedbacksignale dieses Nutzers:",
    ...recentFeedback,
    "Diese Feedbacksignale sind nur weiche Ranking-Signale fuer diesen Nutzer.",
    "Sie duerfen harte Ausschluesse, Allergien oder Unvertraeglichkeiten niemals ueberstimmen."
  ];
}

