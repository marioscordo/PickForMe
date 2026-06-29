import OpenAI from "openai";
import { z } from "zod";
import { buildProfilePromptLines } from "../profile/profileRules";
import type { MenuFacts } from "../types/menuFacts";
import type { Situation, UserProfile } from "../types/profile";

const RecommendationModeSchema = z.enum(["single_dishes", "whole_menu", "sharing_menu"]);

const ConciergeRecommendationSchema = z.object({
  conciergeCompass: z.string().trim().min(8).optional(),
  recommendationMode: RecommendationModeSchema.optional(),
  recommendations: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(3),
        factId: z.string().trim().min(1),
        reason: z.string().trim().min(8)
      })
    )
    .max(3)
});

export type ConciergeRecommendationResult = z.infer<typeof ConciergeRecommendationSchema>;

export async function askConciergeRecommendationAI({
  menuFacts,
  profile,
  situation
}: {
  menuFacts: MenuFacts;
  profile: UserProfile;
  situation: Situation;
}): Promise<ConciergeRecommendationResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt()
      },
      {
        role: "user",
        content: buildUserPrompt(menuFacts, profile, situation)
      }
    ]
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("Die KI hat keine Concierge-Empfehlung geliefert.");
  }

  const parsed = ConciergeRecommendationSchema.parse(JSON.parse(content) as unknown);

  return validateRecommendationFactIds(parsed, menuFacts);
}

function buildSystemPrompt() {
  return [
    "Du bist PickForMe, ein persoenlicher Restaurant-Concierge.",
    "Empfiehl so, als wuerdest Du einem guten Freund etwas empfehlen, den Du seit Jahren kennst und mit dem Du selbst in diesem Restaurant sitzt.",
    "Du darfst nur aus den gelieferten menuFacts auswaehlen.",
    "Du darfst keine neuen Gerichte, Namen, Preise, Zutaten, Eigenschaften oder Bestellbarkeit erzeugen.",
    "Gib in recommendations ausschliesslich factId-Werte aus menuFacts zurueck.",
    "Waehle keine facts mit itemType course oder orderability part_of_menu als eigenstaendige Empfehlung.",
    "Waehle keine drinks, wenn eine Food-Empfehlung gefragt ist.",
    "Wenn eine passende standalone MenuUnit vorhanden ist und die Karte wie ein Gesamtmenue strukturiert ist, empfehle diese Menueeinheit.",
    "Wenn menuFacts eine standalone MenuUnit enthalten und die Items ueberwiegend course oder part_of_menu sind, empfehle die MenuUnit statt einzelner Courses.",
    "Wenn passende standalone dishes vorhanden sind, empfehle bis zu 3 einzelne Gerichte.",
    "Harte Ausschluesse und Unvertraeglichkeiten aus dem Profil sind verbindlich.",
    "Gib conciergeCompass immer als 1 bis maximal 2 kurze deutsche Saetze aus.",
    "conciergeCompass klingt wie ein guter Freund am Tisch und ordnet das Restaurant- oder Menuekonzept aus menuFacts ein.",
    "Bei recommendationMode whole_menu macht conciergeCompass klar, warum das Gesamtmenue sinnvoller ist als einzelne Gaenge.",
    "reason muss ein kurzer, natuerlicher deutscher Satz sein.",
    "reason muss freundschaftlich klingen und ein belegtes Detail aus dem referenzierten Fact mit Profil oder Situation verbinden.",
    "Vermeide generische Begruendungen wie enthaelt Fleisch, proteinreich, macht satt oder passt zu Deinem Hunger, wenn kein konkretes Fact-Detail genannt wird.",
    "Bei recommendationMode whole_menu darf reason nicht generisch ueber Hunger, tolle Auswahl oder hochwertig sprechen.",
    "Bei whole_menu vermeide auch generische Begriffe wie kraeftig, schmackhaft, tolle Auswahl oder Hunger, wenn sie nicht konkret aus menuFacts oder Profil ableitbar sind.",
    "Bei whole_menu erklaert reason konkret, warum diese Menueeinheit fuer den Nutzer sinnvoll ist.",
    "Wenn menuFacts zeigen, dass einzelne Gaenge part_of_menu sind, darf reason sagen, dass einzelne Gaenge hier nicht als separate Auswahl wirken.",
    "Keine Gesundheitswirkungen und keine Qualitaetsbehauptungen wie hochwertig, wenn sie nicht aus menuFacts ableitbar sind.",
    "Erzeuge in reason keine neuen Namen, Preise, Zutaten, Qualitaetsbehauptungen oder Bestellbarkeit.",
    "conciergeCompass darf persoenlich und emotional sein, aber keine konkreten Menuefakten behaupten, die nicht in menuFacts stehen.",
    "Antworte ausschliesslich als valides JSON ohne Markdown.",
    "JSON-Format:",
    "{",
    '  "conciergeCompass": "kurzer persoenlicher deutscher Kompass in 1 bis 2 Saetzen",',
    '  "recommendationMode": "single_dishes | whole_menu | sharing_menu",',
    '  "recommendations": [',
    "    {",
    '      "rank": 1,',
    '      "factId": "item_001 oder unit_001",',
    '      "reason": "konkreter deutscher Satz mit belegtem Fact-Detail und Profilbezug"',
    "    }",
    "  ]",
    "}"
  ].join("\n");
}

function buildUserPrompt(menuFacts: MenuFacts, profile: UserProfile, situation: Situation) {
  return [
    ...buildProfilePromptLines(profile, situation),
    "",
    "Aufgabe:",
    "Waehle aus den folgenden menuFacts bis zu 3 sichere Empfehlungen.",
    "Nutze ausschliesslich factId-Werte, die in diesen menuFacts existieren.",
    "Wenn keine sichere Empfehlung moeglich ist, gib eine leere recommendations-Liste zurueck.",
    "",
    "menuFacts JSON:",
    JSON.stringify(menuFacts, null, 2)
  ].join("\n");
}

function validateRecommendationFactIds(
  result: ConciergeRecommendationResult,
  menuFacts: MenuFacts
): ConciergeRecommendationResult {
  const candidateMenuUnitIds = menuFacts.menuUnits
    .filter((unit) => unit.orderability === "standalone")
    .map((unit) => unit.id);
  const candidateStandaloneDishIds = menuFacts.items
    .filter((item) => item.itemType === "dish" && item.orderability === "standalone")
    .map((item) => item.id);
  const allFactIds = new Set([
    ...menuFacts.menuUnits.map((unit) => unit.id),
    ...menuFacts.items.map((item) => item.id)
  ]);
  const selectableFactIds = new Set([
    ...candidateMenuUnitIds,
    ...candidateStandaloneDishIds
  ]);
  const seen = new Set<string>();
  const recommendations = result.recommendations
    .sort((a, b) => a.rank - b.rank)
    .filter((recommendation) => {
      if (!allFactIds.has(recommendation.factId)) {
        return false;
      }

      if (!selectableFactIds.has(recommendation.factId) || seen.has(recommendation.factId)) {
        return false;
      }

      seen.add(recommendation.factId);
      return true;
    });
  const safeFallbackRecommendations =
    recommendations.length === 0
      ? getSafeFallbackRecommendations(candidateMenuUnitIds, candidateStandaloneDishIds)
      : recommendations;
  const selectedMenuUnit = safeFallbackRecommendations.length > 0
    ? menuFacts.menuUnits.find((unit) => unit.id === safeFallbackRecommendations[0]?.factId)
    : undefined;
  const finalRecommendations = selectedMenuUnit
    ? normalizeWholeMenuReasons(safeFallbackRecommendations, selectedMenuUnit.id)
    : safeFallbackRecommendations;

  return {
    conciergeCompass: getConciergeCompass(result.conciergeCompass, selectedMenuUnit, menuFacts),
    recommendationMode: getFallbackRecommendationMode(selectedMenuUnit) ?? result.recommendationMode,
    recommendations: finalRecommendations
  };
}

function getSafeFallbackRecommendations(
  candidateMenuUnitIds: string[],
  candidateStandaloneDishIds: string[]
): ConciergeRecommendationResult["recommendations"] {
  if (candidateMenuUnitIds.length !== 1 || candidateStandaloneDishIds.length !== 0) {
    return [];
  }

  return [
    {
      rank: 1,
      factId: candidateMenuUnitIds[0]!,
      reason:
        "Ich würde hier das Menü nehmen, weil die einzelnen Gänge in der Karte als Teil eines Gesamtmenüs wirken und nicht als separate Auswahl."
    }
  ];
}

function normalizeWholeMenuReasons(
  recommendations: ConciergeRecommendationResult["recommendations"],
  menuUnitId: string
): ConciergeRecommendationResult["recommendations"] {
  return recommendations.map((recommendation) => {
    if (recommendation.factId !== menuUnitId || !hasGenericWholeMenuReason(recommendation.reason)) {
      return recommendation;
    }

    return {
      ...recommendation,
      reason:
        "Ich würde hier das Menü nehmen, weil die einzelnen Gänge in der Karte als Teil eines Gesamtmenüs wirken und nicht als separate Auswahl."
    };
  });
}

function hasGenericWholeMenuReason(reason: string) {
  const normalizedReason = normalizeReason(reason);
  const forbiddenFragments = [
    "kraftig",
    "kraeftig",
    "schmackhaft",
    "tolle auswahl",
    "hunger",
    "hochwertig",
    "proteinreich"
  ];

  return forbiddenFragments.some((fragment) => normalizedReason.includes(fragment));
}

function getConciergeCompass(
  conciergeCompass: string | undefined,
  selectedMenuUnit: MenuFacts["menuUnits"][number] | undefined,
  menuFacts: MenuFacts
) {
  const cleanedCompass = conciergeCompass?.trim();

  if (cleanedCompass) {
    return cleanedCompass;
  }

  if (!selectedMenuUnit) {
    return undefined;
  }

  const hasMenuCourses = menuFacts.items.some(
    (item) => item.itemType === "course" || item.orderability === "part_of_menu"
  );

  if (!hasMenuCourses) {
    return "Das wirkt hier eher wie eine bestellbare Menüeinheit als wie eine Liste einzelner Gerichte. Ich würde sie als zusammenhängende Empfehlung betrachten.";
  }

  return "Das wirkt hier eher wie ein Menü-Erlebnis als wie eine klassische Speisekarte. Ich würde deshalb nicht einzelne Gänge herauspicken, sondern die Menüeinheit nehmen.";
}

function getFallbackRecommendationMode(
  fallbackMenuUnit: MenuFacts["menuUnits"][number] | undefined
): ConciergeRecommendationResult["recommendationMode"] {
  if (!fallbackMenuUnit) {
    return undefined;
  }

  return fallbackMenuUnit.itemType === "sharing_menu" ? "sharing_menu" : "whole_menu";
}

function normalizeReason(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
