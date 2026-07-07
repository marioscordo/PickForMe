import OpenAI from "openai";
import { z } from "zod";
import type { Dish, DishRoleTag } from "../types/menu";
import type { DishRoleClassification } from "../menu/applyDishRoleClassifications";

const DISH_ROLE_TAGS = [
  "starter",
  "soup",
  "salad",
  "main",
  "side",
  "dessert",
  "drink",
  "breakfast",
  "brunch",
  "kids",
  "menuSet",
  "unknown"
] as const;

const DishRoleClassificationSchema = z.object({
  dishId: z.string().trim().min(1),
  dishRoles: z.array(z.enum(DISH_ROLE_TAGS)).min(1).max(4),
  primaryRole: z.enum(DISH_ROLE_TAGS),
  roleConfidence: z.number().min(0).max(1),
  roleEvidence: z.string().trim().min(1).max(300)
});

const DishRoleClassificationResponseSchema = z.object({
  classifications: z.array(DishRoleClassificationSchema).max(100)
});

type DishRoleClassificationInputDish = Pick<
  Dish,
  | "id"
  | "nameOriginal"
  | "descriptionOriginal"
  | "price"
  | "category"
  | "sourceCategory"
  | "sourceCategoryOriginal"
  | "sourceLine"
  | "dishRoles"
  | "primaryRole"
>;

export async function classifyDishRolesAI({
  dishes,
  signal
}: {
  dishes: Dish[];
  signal?: AbortSignal;
}): Promise<DishRoleClassification[]> {
  if (dishes.length === 0) {
    return [];
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("DISH_ROLE_CLASSIFICATION_AI_DISABLED");
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create(
    {
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify({
            allowedDishRoles: DISH_ROLE_TAGS,
            dishes: dishes.map(toInputDish)
          })
        }
      ]
    },
    signal ? { signal } : undefined
  );

  const parsed = DishRoleClassificationResponseSchema.parse(
    JSON.parse(stripJsonFence(completion.choices[0]?.message?.content ?? ""))
  );

  return parsed.classifications.map((classification) => ({
    dishId: classification.dishId,
    dishRoles: classification.dishRoles as DishRoleTag[],
    primaryRole: classification.primaryRole,
    roleConfidence: classification.roleConfidence,
    roleEvidence: classification.roleEvidence
  }));
}

function buildSystemPrompt() {
  return [
    "Du bist ein gekapselter GustaroAI-Rollenklassifikator.",
    "Deine einzige Aufgabe: bereits erkannte Speisekartengerichte in Rollen klassifizieren.",
    "Du empfiehlst nichts, waehlst nichts aus und bildest keine Rangfolge.",
    "Beruecksichtige kein Nutzerprofil und keine Situation.",
    "Erzeuge keine neuen Gerichte, keine Preise, keine Zutaten und keine Beschreibungen.",
    "Aendere keine Namen, Preise oder Beschreibungen.",
    "Klassifiziere nur dishIds, die im Input vorhanden sind.",
    "Wenn eine Rolle unsicher ist, nutze primaryRole unknown und dishRoles [\"unknown\"].",
    "Salate, Bowls, Kindergerichte und Menues nicht automatisch zu starter oder main hochstufen.",
    "roleEvidence muss ein kurzer exakter Ausschnitt aus nameOriginal, descriptionOriginal, category, sourceCategory oder sourceLine des Input-Gerichts sein.",
    "Antworte ausschliesslich als valides JSON ohne Markdown.",
    "Antwortformat:",
    "{",
    '  "classifications": [',
    "    {",
    '      "dishId": "exakte id aus dem Input",',
    '      "dishRoles": ["main"],',
    '      "primaryRole": "main",',
    '      "roleConfidence": 0.82,',
    '      "roleEvidence": "kurzer exakter Input-Ausschnitt"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function toInputDish(dish: Dish): DishRoleClassificationInputDish {
  return {
    id: dish.id,
    nameOriginal: dish.nameOriginal,
    descriptionOriginal: dish.descriptionOriginal,
    price: dish.price,
    category: dish.category,
    sourceCategory: dish.sourceCategory,
    sourceCategoryOriginal: dish.sourceCategoryOriginal,
    sourceLine: dish.sourceLine,
    dishRoles: dish.dishRoles,
    primaryRole: dish.primaryRole
  };
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
