import OpenAI from "openai";
import { z } from "zod";
import { blockReasonForRecommendation, buildProfilePromptLines } from "../profile/profileRules";
import type { Dish } from "../types/menu";
import type { UserProfile } from "../types/profile";
import type { Recommendation, StarterPairing } from "../types/recommendations";

const CandidatePairingsSchema = z.object({
  pairings: z.array(z.object({
    dishId: z.string().trim().min(1),
    starterCandidateId: z.string().trim().min(1),
    translatedName: z.string().trim().optional()
  })).max(3)
});

const SourcePairingsSchema = z.object({
  pairings: z.array(z.object({
    dishId: z.string().trim().min(1),
    nameOriginal: z.string().trim().min(1),
    translatedName: z.string().trim().min(1),
    priceRaw: z.string().trim().optional(),
    evidence: z.string().trim().min(1)
  })).max(3)
});

export type StarterPairingCandidate = {
  id: string;
  nameOriginal: string;
  translatedName?: string;
  descriptionOriginal?: string;
  priceRaw?: string;
  category?: string;
  sourceLine?: string;
  evidence?: string;
};

type MainPairingItem = {
  dishId: string;
  nameOriginal: string;
  translatedName?: string;
  descriptionOriginal?: string;
  sourceLine?: string;
  rank?: number;
};

type StarterValidationContext = {
  mainItems: MainPairingItem[];
  usedStarterNames: string[];
};

type ProfileInput = Partial<UserProfile>;

export async function addStarterPairingsFromCandidatesAI({
  dishes,
  recommendations,
  allRecommendations,
  candidates,
  profile,
  userLocale,
  signal
}: {
  dishes: Dish[];
  recommendations: Recommendation[];
  allRecommendations?: Recommendation[];
  candidates: StarterPairingCandidate[];
  profile: ProfileInput;
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);
  const validationContext = buildStarterValidationContext({ dishes, recommendations, allRecommendations });
  const candidateItems = candidates
    .filter((candidate) => isSafeStarterCandidate(candidate, profile, validationContext))
    .sort((left, right) => compareStarterReusePreference(left, right, validationContext.usedStarterNames))
    .slice(0, 80);

  if (mains.length === 0 || candidateItems.length === 0) {
    return recommendations;
  }

  if (candidateItems.length === 1) {
    return applySingleStarterCandidate(recommendations, mains, candidateItems[0]!);
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("STARTER_PAIRING_AI_DISABLED");
  }

  const client = new OpenAI({ apiKey });
  const targetLocale = normalizeTargetLocale(userLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);

  const completion = await client.chat.completions.create(
    {
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildCandidateSystemPrompt(targetLanguage, targetLocale)
        },
        {
          role: "user",
          content: JSON.stringify({
            profile: buildProfilePromptLines(profile, "richtig_hunger"),
            mainRecommendations: mains,
            starterCandidates: candidateItems
          })
        }
      ]
    },
    signal ? { signal } : undefined
  );

  const parsed = CandidatePairingsSchema.parse(
    JSON.parse(stripJsonFence(completion.choices[0]?.message?.content ?? ""))
  );
  const candidateById = new Map(candidateItems.map((candidate) => [candidate.id, candidate]));
  const mainIds = new Set(mains.map((main) => main.dishId));
  const pairings = new Map<string, StarterPairing>();

  for (const pairing of parsed.pairings) {
    if (!mainIds.has(pairing.dishId)) {
      continue;
    }

    const candidate = candidateById.get(pairing.starterCandidateId);

    if (!candidate || !isSafeStarterCandidate(candidate, profile, validationContext)) {
      continue;
    }

    pairings.set(pairing.dishId, candidateToStarterPairing(candidate, pairing.translatedName));
  }

  return applyStarterPairings(recommendations, pairings);
}

export async function addStarterPairingsFromPdfUrlAI({
  pdfUrl,
  dishes,
  recommendations,
  allRecommendations,
  profile,
  userLocale
}: {
  pdfUrl: string;
  dishes: Dish[];
  recommendations: Recommendation[];
  allRecommendations?: Recommendation[];
  profile: ProfileInput;
  userLocale?: string;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);
  const validationContext = buildStarterValidationContext({ dishes, recommendations, allRecommendations });

  if (mains.length === 0) {
    return recommendations;
  }

  return addStarterPairingsFromSourceAI({
    source: {
      kind: "pdf",
      pdfUrl
    },
    mains,
    recommendations,
    validationContext,
    profile,
    userLocale
  });
}

export async function addStarterPairingsFromImageUrlsAI({
  imageUrls,
  dishes,
  recommendations,
  allRecommendations,
  profile,
  userLocale
}: {
  imageUrls: string[];
  dishes: Dish[];
  recommendations: Recommendation[];
  allRecommendations?: Recommendation[];
  profile: ProfileInput;
  userLocale?: string;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);
  const validationContext = buildStarterValidationContext({ dishes, recommendations, allRecommendations });
  const usableImageUrls = imageUrls.filter((value) => value.trim().length > 0).slice(0, 8);

  if (mains.length === 0 || usableImageUrls.length === 0) {
    return recommendations;
  }

  return addStarterPairingsFromSourceAI({
    source: {
      kind: "images",
      imageUrls: usableImageUrls
    },
    mains,
    recommendations,
    validationContext,
    profile,
    userLocale
  });
}

export async function addStarterPairingsFromMenuTextAI({
  menuText,
  dishes,
  recommendations,
  allRecommendations,
  profile,
  userLocale
}: {
  menuText: string;
  dishes: Dish[];
  recommendations: Recommendation[];
  allRecommendations?: Recommendation[];
  profile: ProfileInput;
  userLocale?: string;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);
  const validationContext = buildStarterValidationContext({ dishes, recommendations, allRecommendations });
  const sourceText = menuText.trim();

  if (mains.length === 0 || sourceText.length < 20) {
    return recommendations;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("STARTER_PAIRING_AI_DISABLED");
  }

  const client = new OpenAI({ apiKey });
  const targetLocale = normalizeTargetLocale(userLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Du bist eine gekapselte GustaroAI-Vorspeisenroutine.",
          "Die Hauptgericht-Empfehlungen sind bereits final.",
          "Deine einzige Aufgabe: Suche aus dem Original-Speisekartentext je Hauptgericht hoechstens eine passende Vorspeise.",
          "Veraendere keine Hauptgericht-Empfehlung und gib keine neuen Hauptgerichte aus.",
          `Sprache fuer translatedName: ${targetLanguage} (${targetLocale}).`,
          "nameOriginal muss exakt sichtbar im Speisekartentext stehen.",
          "translatedName ist nur die Uebersetzung oder knappe Erklaerung der Vorspeise in der Zielsprache.",
          "evidence muss ein kurzer sichtbarer Originalbeleg aus dem Speisekartentext sein.",
          "Waehle nur klare Vorspeisen, Antipasti, Suppen oder kleine erste Gaenge.",
          "Keine Getraenke, Desserts, Beilagen, Extras, Kategorien oder Hauptgerichte.",
          "Erfinde nichts. Keine Zutaten, Preise oder Fakten ergaenzen.",
          "Harte Ausschluesse und Unvertraeglichkeiten aus dem Profil sind verbindlich.",
          "Wenn keine sichere Vorspeise passt, lasse das jeweilige dishId weg.",
          "Antworte ausschliesslich als valides JSON ohne Markdown."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          profile: buildProfilePromptLines(profile, "richtig_hunger"),
          mainRecommendations: mains,
          menuText: sourceText.slice(0, 20000),
          responseFormat: {
            pairings: [
              {
                dishId: "dishId des Hauptgerichts",
                nameOriginal: "exakter sichtbarer Originalname der Vorspeise",
                translatedName: "Uebersetzung/Erklaerung der Vorspeise in der Zielsprache",
                priceRaw: "Preis falls sichtbar",
                evidence: "kurzer sichtbarer Originalbeleg"
              }
            ]
          }
        })
      }
    ]
  });

  const parsed = SourcePairingsSchema.parse(
    JSON.parse(stripJsonFence(completion.choices[0]?.message?.content ?? ""))
  );

  return applySourcePairingResult({
    parsed,
    mains,
    recommendations,
    validationContext,
    profile
  });
}

async function addStarterPairingsFromSourceAI({
  source,
  mains,
  recommendations,
  validationContext,
  profile,
  userLocale
}: {
  source: { kind: "pdf"; pdfUrl: string } | { kind: "images"; imageUrls: string[] };
  mains: MainPairingItem[];
  recommendations: Recommendation[];
  validationContext: StarterValidationContext;
  profile: ProfileInput;
  userLocale?: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("STARTER_PAIRING_AI_DISABLED");
  }

  const client = new OpenAI({ apiKey });
  const targetLocale = normalizeTargetLocale(userLocale);
  const targetLanguage = getLanguageNameForLocale(targetLocale);
  const model = source.kind === "images"
    ? process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_PDF_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"
    : process.env.OPENAI_PDF_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const content = [
    {
      type: "input_text" as const,
      text: buildSourcePrompt({
        mains,
        profile,
        targetLanguage,
        targetLocale
      })
    },
    ...(source.kind === "pdf"
      ? [
          {
            type: "input_file" as const,
            file_url: source.pdfUrl
          }
        ]
      : source.imageUrls.map((imageUrl) => ({
          type: "input_image" as const,
          image_url: imageUrl,
          detail: "high" as const
        })))
  ];

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content
      }
    ]
  });

  const parsed = SourcePairingsSchema.parse(JSON.parse(stripJsonFence(response.output_text ?? "")));

  return applySourcePairingResult({
    parsed,
    mains,
    recommendations,
    validationContext,
    profile
  });
}

function applySourcePairingResult({
  parsed,
  mains,
  recommendations,
  validationContext,
  profile
}: {
  parsed: z.infer<typeof SourcePairingsSchema>;
  mains: MainPairingItem[];
  recommendations: Recommendation[];
  validationContext: StarterValidationContext;
  profile: ProfileInput;
}) {
  const mainIds = new Set(mains.map((main) => main.dishId));
  const pairings = new Map<string, StarterPairing>();

  for (const pairing of parsed.pairings) {
    if (!mainIds.has(pairing.dishId)) {
      continue;
    }

    const candidate = pairingToCandidate(pairing);

    if (!isSafeStarterCandidate(candidate, profile, validationContext)) {
      continue;
    }

    pairings.set(pairing.dishId, {
      nameOriginal: pairing.nameOriginal,
      translatedName: pairing.translatedName,
      priceRaw: pairing.priceRaw,
      evidence: pairing.evidence
    });
  }

  return applyStarterPairings(recommendations, pairings);
}

function buildMainItems(dishes: Dish[], recommendations: Recommendation[]): MainPairingItem[] {
  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));

  return recommendations
    .map((recommendation, index): MainPairingItem | null => {
      const dish = dishesById.get(recommendation.dishId);

      if (!dish) {
        return null;
      }

      return {
        dishId: recommendation.dishId,
        nameOriginal: dish.nameOriginal,
        translatedName: recommendation.translatedName,
        descriptionOriginal: dish.descriptionOriginal,
        sourceLine: dish.sourceLine,
        rank: recommendation.rank ?? index + 1
      };
    })
    .filter((item): item is MainPairingItem => Boolean(item))
    .slice(0, 3);
}

function buildStarterValidationContext({
  dishes,
  recommendations,
  allRecommendations
}: {
  dishes: Dish[];
  recommendations: Recommendation[];
  allRecommendations?: Recommendation[];
}): StarterValidationContext {
  const recommendationScope = allRecommendations?.length ? allRecommendations : recommendations;

  return {
    mainItems: buildMainItems(dishes, recommendationScope),
    usedStarterNames: buildUsedStarterNames(recommendationScope)
  };
}

function buildCandidateSystemPrompt(targetLanguage: string, targetLocale: string) {
  return [
    "You select optional starter pairings for existing GustaroAI main-course recommendations.",
    `Target language for translatedName: ${targetLanguage} (${targetLocale}).`,
    "The main recommendations are final. Do not change their order, dishId, names, or selection.",
    "Choose at most one starterCandidateId for each main recommendation.",
    "Choose only from starterCandidates. Do not invent dishes.",
    "Only choose a candidate when it is a clear appetizer, starter, antipasto, soup, or small first course from the menu context.",
    "Do not choose drinks, desserts, sides, extras, categories, or another main course.",
    "Hard exclusions and intolerances from the profile are mandatory.",
    "If no safe starter fits a main dish, omit that main dish.",
    "Return translatedName in the target language for the chosen starter.",
    "Do not add ingredients, prices, ratings, restaurant facts, or atmosphere.",
    "Return only valid JSON with pairings."
  ].join("\n");
}

function buildSourcePrompt({
  mains,
  profile,
  targetLanguage,
  targetLocale
}: {
  mains: MainPairingItem[];
  profile: ProfileInput;
  targetLanguage: string;
  targetLocale: string;
}) {
  return [
    "Du bist eine gekapselte GustaroAI-Vorspeisenroutine.",
    "Die Hauptgericht-Empfehlungen sind bereits final.",
    "Deine einzige Aufgabe: Suche aus der beigefuegten Original-Speisekarte je Hauptgericht hoechstens eine passende Vorspeise.",
    "Veraendere keine Hauptgericht-Empfehlung und gib keine neuen Hauptgerichte aus.",
    `Sprache fuer translatedName: ${targetLanguage} (${targetLocale}).`,
    "nameOriginal muss exakt sichtbar in der Speisekarte stehen.",
    "translatedName ist nur die Uebersetzung oder knappe Erklaerung der Vorspeise in der Zielsprache.",
    "evidence muss ein kurzer sichtbarer Originalbeleg aus der Speisekarte sein.",
    "Waehle nur klare Vorspeisen, Antipasti, Suppen oder kleine erste Gaenge.",
    "Keine Getraenke, Desserts, Beilagen, Extras, Kategorien oder Hauptgerichte.",
    "Erfinde nichts. Keine Zutaten, Preise oder Fakten ergaenzen.",
    "Harte Ausschluesse und Unvertraeglichkeiten aus dem Profil sind verbindlich.",
    "Wenn keine sichere Vorspeise passt, lasse das jeweilige dishId weg.",
    "",
    "Profil:",
    ...buildProfilePromptLines(profile, "richtig_hunger"),
    "",
    "Finale Hauptgericht-Empfehlungen:",
    JSON.stringify(mains),
    "",
    "Antwortformat:",
    "Antworte ausschliesslich als valides JSON ohne Markdown.",
    "{",
    '  "pairings": [',
    "    {",
    '      "dishId": "dishId des Hauptgerichts",',
    '      "nameOriginal": "exakter sichtbarer Originalname der Vorspeise",',
    '      "translatedName": "Uebersetzung/Erklaerung der Vorspeise in der Zielsprache",',
    '      "priceRaw": "Preis falls sichtbar",',
    '      "evidence": "kurzer sichtbarer Originalbeleg"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function candidateToStarterPairing(
  candidate: StarterPairingCandidate,
  translatedName?: string
): StarterPairing {
  return {
    nameOriginal: candidate.nameOriginal,
    translatedName: translatedName?.trim() || candidate.translatedName,
    priceRaw: candidate.priceRaw,
    evidence: candidate.evidence ?? candidate.sourceLine
  };
}

function pairingToCandidate(pairing: z.infer<typeof SourcePairingsSchema>["pairings"][number]): StarterPairingCandidate {
  return {
    id: pairing.nameOriginal,
    nameOriginal: pairing.nameOriginal,
    translatedName: pairing.translatedName,
    priceRaw: pairing.priceRaw,
    evidence: pairing.evidence,
    sourceLine: pairing.evidence
  };
}

function applyStarterPairings(
  recommendations: Recommendation[],
  pairings: Map<string, StarterPairing>
) {
  return recommendations.map((recommendation) => ({
    ...recommendation,
    starter: pairings.get(recommendation.dishId) ?? recommendation.starter
  }));
}

function applySingleStarterCandidate(
  recommendations: Recommendation[],
  mains: MainPairingItem[],
  candidate: StarterPairingCandidate
) {
  const mainIds = new Set(mains.map((main) => main.dishId));
  const starter = candidateToStarterPairing(candidate);

  return applyStarterPairings(
    recommendations,
    new Map(
      recommendations
        .filter((recommendation) => mainIds.has(recommendation.dishId))
        .map((recommendation) => [recommendation.dishId, starter])
    )
  );
}

function isSafeStarterCandidate(
  candidate: StarterPairingCandidate,
  profile: ProfileInput,
  validationContext?: StarterValidationContext
) {
  if (validationContext && isCandidateTooSimilarToAnyMain(candidate, validationContext.mainItems)) {
    return false;
  }

  return !blockReasonForRecommendation(
    {
      nameOriginal: candidate.nameOriginal,
      descriptionOriginal: candidate.descriptionOriginal,
      category: candidate.category,
      sourceLine: candidate.sourceLine,
      evidence: candidate.evidence
    },
    profile
  );
}

function compareStarterReusePreference(
  left: StarterPairingCandidate,
  right: StarterPairingCandidate,
  usedStarterNames: string[]
) {
  const leftUsed = hasSimilarStarterName(left, usedStarterNames);
  const rightUsed = hasSimilarStarterName(right, usedStarterNames);

  if (leftUsed === rightUsed) {
    return 0;
  }

  return leftUsed ? 1 : -1;
}

function buildUsedStarterNames(recommendations: Recommendation[]) {
  const names: string[] = [];

  for (const recommendation of recommendations) {
    const starter = recommendation.starter;

    if (!starter) {
      continue;
    }

    addComparisonName(names, starter.nameOriginal);
    addComparisonName(names, starter.translatedName);
  }

  return names;
}

function isCandidateTooSimilarToAnyMain(candidate: StarterPairingCandidate, mains: MainPairingItem[]) {
  return mains.some((main) =>
    getStarterComparisonNames(candidate).some((starterName) =>
      getMainComparisonNames(main).some((mainName) => areDishNamesTooSimilar(starterName, mainName))
    )
  );
}

function hasSimilarStarterName(candidate: StarterPairingCandidate, usedStarterNames: string[]) {
  return getStarterComparisonNames(candidate).some((starterName) =>
    usedStarterNames.some((usedName) => areDishNamesTooSimilar(starterName, usedName))
  );
}

function addStarterComparisonNames(names: string[], candidate: StarterPairingCandidate) {
  addComparisonName(names, candidate.nameOriginal);
  addComparisonName(names, candidate.translatedName);
}

function addComparisonName(names: string[], value: string | undefined) {
  const normalized = normalizeKey(value ?? "");

  if (normalized) {
    names.push(value ?? "");
  }
}

function getStarterComparisonNames(candidate: StarterPairingCandidate) {
  return [candidate.nameOriginal, candidate.translatedName].filter((value): value is string =>
    Boolean(value?.trim())
  );
}

function getMainComparisonNames(main: MainPairingItem) {
  return [main.nameOriginal, main.translatedName].filter((value): value is string =>
    Boolean(value?.trim())
  );
}

function normalizeTargetLocale(value: string | undefined) {
  const locale = value?.trim();

  return locale ? locale.slice(0, 40) : "de-DE";
}

function getLanguageNameForLocale(locale: string) {
  const languageCode = locale.toLowerCase().split(/[-_]/)[0];

  switch (languageCode) {
    case "de":
      return "German";
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "it":
      return "Italian";
    case "nl":
      return "Dutch";
    case "pl":
      return "Polish";
    case "pt":
      return "Portuguese";
    default:
      return locale;
  }
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["'`´‘’‚“”„«»]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCoreKey(value: string) {
  return normalizeKey(value)
    .split(" ")
    .filter((token) => token && !DISH_NAME_VARIANT_TOKENS.has(token))
    .join(" ");
}

function areDishNamesTooSimilar(left: string, right: string) {
  const normalizedLeft = normalizeKey(left);
  const normalizedRight = normalizeKey(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const coreLeft = normalizeCoreKey(left);
  const coreRight = normalizeCoreKey(right);

  return Boolean(coreLeft && coreRight && coreLeft === coreRight);
}

const DISH_NAME_VARIANT_TOKENS = new Set([
  "a",
  "al",
  "alla",
  "alle",
  "allo",
  "an",
  "and",
  "auf",
  "au",
  "aux",
  "baked",
  "braten",
  "con",
  "das",
  "de",
  "dem",
  "den",
  "der",
  "di",
  "die",
  "e",
  "et",
  "forno",
  "fried",
  "fritta",
  "fritte",
  "frittiert",
  "fritto",
  "gebraten",
  "gebratene",
  "gebratenem",
  "gebratenen",
  "gebratener",
  "gebratenes",
  "gegrillt",
  "gegrillte",
  "gegrilltem",
  "gegrillten",
  "gegrillter",
  "gegrilltes",
  "griglia",
  "grill",
  "grilled",
  "grille",
  "grillee",
  "grigliata",
  "grigliato",
  "in",
  "la",
  "le",
  "mit",
  "on",
  "roasted",
  "vom",
  "von",
  "with",
  "und"
]);

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
