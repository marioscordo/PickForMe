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

type ProfileInput = Partial<UserProfile>;

export async function addStarterPairingsFromCandidatesAI({
  dishes,
  recommendations,
  candidates,
  profile,
  userLocale,
  signal
}: {
  dishes: Dish[];
  recommendations: Recommendation[];
  candidates: StarterPairingCandidate[];
  profile: ProfileInput;
  userLocale?: string;
  signal?: AbortSignal;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);
  const candidateItems = candidates
    .filter((candidate) => isSafeStarterCandidate(candidate, profile))
    .slice(0, 80);

  if (mains.length === 0 || candidateItems.length === 0) {
    return recommendations;
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
  const usedStarterIds = new Set<string>();
  const pairings = new Map<string, StarterPairing>();

  for (const pairing of parsed.pairings) {
    if (!mainIds.has(pairing.dishId) || usedStarterIds.has(pairing.starterCandidateId)) {
      continue;
    }

    const candidate = candidateById.get(pairing.starterCandidateId);

    if (!candidate || !isSafeStarterCandidate(candidate, profile)) {
      continue;
    }

    usedStarterIds.add(pairing.starterCandidateId);
    pairings.set(pairing.dishId, candidateToStarterPairing(candidate, pairing.translatedName));
  }

  return applyStarterPairings(recommendations, pairings);
}

export async function addStarterPairingsFromPdfUrlAI({
  pdfUrl,
  dishes,
  recommendations,
  profile,
  userLocale
}: {
  pdfUrl: string;
  dishes: Dish[];
  recommendations: Recommendation[];
  profile: ProfileInput;
  userLocale?: string;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);

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
    profile,
    userLocale
  });
}

export async function addStarterPairingsFromImageUrlsAI({
  imageUrls,
  dishes,
  recommendations,
  profile,
  userLocale
}: {
  imageUrls: string[];
  dishes: Dish[];
  recommendations: Recommendation[];
  profile: ProfileInput;
  userLocale?: string;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);
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
    profile,
    userLocale
  });
}

export async function addStarterPairingsFromMenuTextAI({
  menuText,
  dishes,
  recommendations,
  profile,
  userLocale
}: {
  menuText: string;
  dishes: Dish[];
  recommendations: Recommendation[];
  profile: ProfileInput;
  userLocale?: string;
}): Promise<Recommendation[]> {
  const mains = buildMainItems(dishes, recommendations);
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
          "Du bist eine gekapselte PickForMe-Vorspeisenroutine.",
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
    profile
  });
}

async function addStarterPairingsFromSourceAI({
  source,
  mains,
  recommendations,
  profile,
  userLocale
}: {
  source: { kind: "pdf"; pdfUrl: string } | { kind: "images"; imageUrls: string[] };
  mains: MainPairingItem[];
  recommendations: Recommendation[];
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
    profile
  });
}

function applySourcePairingResult({
  parsed,
  mains,
  recommendations,
  profile
}: {
  parsed: z.infer<typeof SourcePairingsSchema>;
  mains: MainPairingItem[];
  recommendations: Recommendation[];
  profile: ProfileInput;
}) {
  const mainIds = new Set(mains.map((main) => main.dishId));
  const pairings = new Map<string, StarterPairing>();
  const usedOriginalNames = new Set<string>();

  for (const pairing of parsed.pairings) {
    const originalKey = normalizeKey(pairing.nameOriginal);

    if (!mainIds.has(pairing.dishId) || usedOriginalNames.has(originalKey)) {
      continue;
    }

    if (!isSafeStarterCandidate(pairingToCandidate(pairing), profile)) {
      continue;
    }

    usedOriginalNames.add(originalKey);
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

function buildCandidateSystemPrompt(targetLanguage: string, targetLocale: string) {
  return [
    "You select optional starter pairings for existing PickForMe main-course recommendations.",
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
    "Du bist eine gekapselte PickForMe-Vorspeisenroutine.",
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

function isSafeStarterCandidate(candidate: StarterPairingCandidate, profile: ProfileInput) {
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
