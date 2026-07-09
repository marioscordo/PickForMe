import { z } from "zod";
import {
  createTwoStepOpenAIClient,
  stripJsonFence
} from "./twoStepRecommendationAIUtils";

const PROFILE_PREFERENCE_CLASSIFICATIONS = [
  "food_item",
  "ingredient",
  "dish",
  "food_category",
  "allergen",
  "property",
  "preparation",
  "nutrition_goal",
  "price_or_portion",
  "ubiquitous_basic",
  "ambiguous",
  "unsafe"
] as const;

const ProfilePreferenceClassificationResponseSchema = z.object({
  allowed: z.boolean(),
  classification: z.enum(PROFILE_PREFERENCE_CLASSIFICATIONS),
  normalizedValue: z.string().trim().min(1).max(80).nullable().optional(),
  reasonCode: z.string().trim().min(1).max(80).nullable().optional()
});

export type ProfilePreferenceClassification = (typeof PROFILE_PREFERENCE_CLASSIFICATIONS)[number];
export type ProfileInputKind = "preference" | "exclusion";

export type ProfilePreferenceClassificationResult = {
  allowed: boolean;
  classification: ProfilePreferenceClassification;
  normalizedValue?: string;
  reasonCode?: string;
};

const ALLOWED_CLASSIFICATIONS_BY_INPUT_KIND: Record<ProfileInputKind, Set<ProfilePreferenceClassification>> = {
  preference: new Set([
    "food_item",
    "ingredient",
    "dish",
    "food_category"
  ]),
  exclusion: new Set([
    "food_item",
    "ingredient",
    "dish",
    "food_category",
    "allergen"
  ])
};

const MAX_PROFILE_PREFERENCE_LENGTH = 60;
const MAX_PROFILE_PREFERENCE_WORDS = 6;

const DETERMINISTIC_BLOCKS: Record<string, ProfilePreferenceClassification> = {
  scharf: "property",
  spicy: "property",
  mild: "property",
  guenstig: "price_or_portion",
  gunstig: "price_or_portion",
  affordable: "price_or_portion",
  cheap: "price_or_portion",
  teuer: "price_or_portion",
  expensive: "price_or_portion",
  "grosse portion": "price_or_portion",
  "grosser teller": "price_or_portion",
  "kleine portion": "price_or_portion",
  "large portion": "price_or_portion",
  "large portions": "price_or_portion",
  "small portion": "price_or_portion",
  proteinreich: "nutrition_goal",
  "high protein": "nutrition_goal",
  "high-protein": "nutrition_goal",
  leicht: "property",
  light: "property",
  gesund: "nutrition_goal",
  healthy: "nutrition_goal",
  deftig: "property",
  cremig: "property",
  creamy: "property",
  knusprig: "property",
  crunchy: "property",
  gegrillt: "preparation",
  grilled: "preparation",
  hausgemacht: "property",
  homemade: "property",
  saettigend: "nutrition_goal",
  sattigend: "nutrition_goal",
  filling: "nutrition_goal",
  kalorienarm: "nutrition_goal",
  "low calorie": "nutrition_goal",
  "low-calorie": "nutrition_goal",
  "low carb": "nutrition_goal",
  "low-carb": "nutrition_goal",
  schnell: "property",
  fast: "property",
  klassisch: "property",
  classic: "property",
  modern: "property",
  salz: "ubiquitous_basic",
  salt: "ubiquitous_basic",
  pfeffer: "ubiquitous_basic",
  pepper: "ubiquitous_basic",
  oel: "ubiquitous_basic",
  ol: "ubiquitous_basic",
  oil: "ubiquitous_basic",
  wasser: "ubiquitous_basic",
  water: "ubiquitous_basic",
  gewuerze: "ubiquitous_basic",
  gewurze: "ubiquitous_basic",
  spices: "ubiquitous_basic",
  kraeuter: "ubiquitous_basic",
  krauter: "ubiquitous_basic",
  herbs: "ubiquitous_basic",
  wuerzung: "ubiquitous_basic",
  wurzung: "ubiquitous_basic",
  seasoning: "ubiquitous_basic",
  sosse: "ubiquitous_basic",
  "sosse allgemein": "ubiquitous_basic",
  sauce: "ubiquitous_basic",
  marinade: "ubiquitous_basic",
  "marinade allgemein": "ubiquitous_basic",
  zucker: "ubiquitous_basic",
  sugar: "ubiquitous_basic"
};

export async function classifyProfilePreferenceAI({
  value,
  signal
}: {
  value: string;
  signal?: AbortSignal;
}): Promise<ProfilePreferenceClassificationResult> {
  return classifyProfileInputAI({
    inputKind: "preference",
    value,
    signal
  });
}

export async function classifyProfileInputAI({
  inputKind,
  value,
  signal
}: {
  inputKind: ProfileInputKind;
  value: string;
  signal?: AbortSignal;
}): Promise<ProfilePreferenceClassificationResult> {
  const deterministic = classifyProfileInputDeterministically(value);

  if (deterministic) {
    return deterministic;
  }

  const inputValue = value.trim();
  const client = createTwoStepOpenAIClient();
  const response = await client.chat.completions.create(
    {
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(inputKind)
        },
        {
          role: "user",
          content: JSON.stringify({ inputKind, value: inputValue })
        }
      ]
    },
    signal ? { signal } : undefined
  );

  const parsed = ProfilePreferenceClassificationResponseSchema.parse(
    JSON.parse(stripJsonFence(response.choices[0]?.message?.content ?? "{}"))
  );

  return normalizeClassificationResult(inputValue, inputKind, parsed);
}

export function classifyProfilePreferenceDeterministically(value: string): ProfilePreferenceClassificationResult | null {
  return classifyProfileInputDeterministically(value);
}

export function classifyProfileInputDeterministically(value: string): ProfilePreferenceClassificationResult | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      allowed: false,
      classification: "ambiguous",
      reasonCode: "empty"
    };
  }

  if (trimmed.length > MAX_PROFILE_PREFERENCE_LENGTH || trimmed.split(/\s+/).length > MAX_PROFILE_PREFERENCE_WORDS) {
    return {
      allowed: false,
      classification: "ambiguous",
      reasonCode: "too_long"
    };
  }

  const blockedClassification = DETERMINISTIC_BLOCKS[normalizePreferenceValue(trimmed)];

  if (blockedClassification) {
    return {
      allowed: false,
      classification: blockedClassification,
      reasonCode: "deterministic_block"
    };
  }

  return null;
}

function normalizeClassificationResult(
  inputValue: string,
  inputKind: ProfileInputKind,
  result: z.infer<typeof ProfilePreferenceClassificationResponseSchema>
): ProfilePreferenceClassificationResult {
  const classification = result.classification;
  const normalizedValue = result.normalizedValue?.trim();
  const allowedClassifications = ALLOWED_CLASSIFICATIONS_BY_INPUT_KIND[inputKind];

  if (!result.allowed || !allowedClassifications.has(classification)) {
    return {
      allowed: false,
      classification,
      reasonCode: result.reasonCode ?? "blocked_classification"
    };
  }

  if (normalizedValue && DETERMINISTIC_BLOCKS[normalizePreferenceValue(normalizedValue)]) {
    return {
      allowed: false,
      classification: "ambiguous",
      reasonCode: "normalized_to_blocked_value"
    };
  }

  return {
    allowed: true,
    classification,
    normalizedValue: normalizedValue || inputValue,
    reasonCode: result.reasonCode ?? undefined
  };
}

function buildSystemPrompt(inputKind: ProfileInputKind) {
  const allowedLine = inputKind === "preference"
    ? "allowed=true nur fuer classification food_item, ingredient, dish oder food_category."
    : "allowed=true nur fuer classification food_item, ingredient, dish, food_category oder allergen.";
  const domainLine = inputKind === "preference"
    ? "Erlaubt als Vorliebe sind konkrete Lebensmittel, speisekartenrelevante Zutaten, Gerichte und Essenskategorien."
    : "Erlaubt als Ausschluss oder Unvertraeglichkeit sind erkennbare Lebensmittel, speisekartenrelevante Zutaten, Gerichte, Essenskategorien, Allergene und persoenliche harte No-Gos.";

  return [
    "Du bist ein gekapselter GustaroAI-Klassifikator fuer eigene Profil-Eingaben.",
    "Deine einzige Aufgabe: einen einzelnen Eingabewert klassifizieren.",
    "Du empfiehlst nichts, analysierst keine Speisekarte und erzeugst keine Profilwerte.",
    domainLine,
    allowedLine,
    "Blockiere Eigenschaften, Geschmacksprofile, Zubereitungsarten, Preis-/Portionswuensche, Naehrwertziele, Stimmungen, universelle Kuechenbasics und allgemeine Gewuerz-/Wuerzungsbegriffe.",
    "Universelle Kuechenbasics wie Salz, Pfeffer, Oel, Wasser, Zucker, Gewuerze, Kraeuter, Wuerzung, Marinade oder Sauce sind nicht als Profil-Eingabe erlaubt.",
    "Bei Unsicherheit: allowed=false und classification=ambiguous.",
    "Du darfst einfache Schreibweisen normalisieren, wenn eindeutig: pizzza -> Pizza, tomate -> Tomaten, rindfleisch -> Rindfleisch.",
    "Du darfst nicht kreativ umdeuten: leicht ist nicht Salat, proteinreich ist nicht Fleisch, scharf ist nicht Chili, gesund ist nicht Vegetarisch.",
    "normalizedValue muss leer/null bleiben, wenn allowed=false.",
    "Antworte ausschliesslich als valides JSON ohne Markdown.",
    "Antwortformat:",
    "{",
    '  "allowed": false,',
    '  "classification": "ambiguous",',
    '  "normalizedValue": null,',
    '  "reasonCode": "short_machine_reason"',
    "}"
  ].join("\n");
}

function normalizePreferenceValue(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
