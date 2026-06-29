import type { Dish } from "../types/menu";
import type { Situation, UserProfile } from "../types/profile";
import type { Recommendation } from "../types/recommendations";
import type { MenuFacts, MenuItemFact, MenuUnitFact } from "../types/menuFacts";
import { blockReasonForRecommendation } from "../profile/profileRules";
import {
  askConciergeRecommendationAI,
  type ConciergeRecommendationResult
} from "./askConciergeRecommendationAI";
import { extractMenuFactsFromTextAI } from "./extractMenuFactsFromTextAI";

const SUMMARY_LABEL = "PickForMe two-step text AI summary";

type TextAiAnalyzeResult = {
  dishes: Dish[];
  recommendations: Recommendation[];
  conciergeCompass?: string;
  recommendationMode?: ConciergeRecommendationResult["recommendationMode"];
  menuType?: string;
};

type RecommendationMode = ConciergeRecommendationResult["recommendationMode"];

type SelectedFact =
  | {
      kind: "item";
      fact: MenuItemFact;
    }
  | {
      kind: "unit";
      fact: MenuUnitFact;
    };

type SelectedRecommendation = {
  fact: SelectedFact;
  rank: number;
  reason: string;
};

type FactLookupResult =
  | SelectedFact
  | {
      rejectionReason: "invalid_fact_id" | "non_selectable_fact";
    };

export async function askPickForMeAI({
  menuText,
  profile,
  situation
}: {
  menuText: string;
  profile: UserProfile;
  situation: Situation;
}): Promise<TextAiAnalyzeResult> {
  if (process.env.PICKFORME_AI_ENABLED !== "true") {
    throw new Error("PickForMe AI ist nicht aktiviert.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const menuFacts = await extractMenuFactsFromTextAI(menuText);
  const conciergeRecommendation = await askConciergeRecommendationAI({
    menuFacts,
    profile,
    situation
  });
  const selectedRecommendations: SelectedRecommendation[] = [];

  for (const recommendation of conciergeRecommendation.recommendations) {
    const lookupResult = findSelectableFact(menuFacts, recommendation.factId);

    if ("rejectionReason" in lookupResult) {
      continue;
    }

    if (isBlockedByProfile(lookupResult, profile, menuFacts)) {
      continue;
    }

    selectedRecommendations.push({
      fact: lookupResult,
      rank: recommendation.rank,
      reason: recommendation.reason
    });
  }
  const recommendationMode =
    conciergeRecommendation.recommendationMode ?? inferRecommendationMode(selectedRecommendations);
  const conciergeCompass = getConciergeCompass({
    conciergeCompass: conciergeRecommendation.conciergeCompass,
    menuFacts,
    recommendationMode,
    selectedRecommendations
  });

  console.log(SUMMARY_LABEL, {
    menuTextLength: menuText.length,
    items: menuFacts.items.length,
    menuUnits: menuFacts.menuUnits.length,
    selectedRecommendations: selectedRecommendations.length,
    returnsEmpty: selectedRecommendations.length === 0,
    hasConciergeCompass: Boolean(conciergeCompass),
    recommendationMode,
    menuTypePresent: Boolean(menuFacts.menuType?.trim())
  });

  return {
    ...toAnalyzeDataParts(selectedRecommendations),
    conciergeCompass,
    recommendationMode,
    menuType: menuFacts.menuType
  };
}

function findSelectableFact(menuFacts: MenuFacts, factId: string): FactLookupResult {
  const menuUnit = menuFacts.menuUnits.find((unit) => unit.id === factId);

  if (menuUnit?.orderability === "standalone") {
    return {
      kind: "unit",
      fact: menuUnit
    };
  }

  if (menuUnit) {
    return {
      rejectionReason: "non_selectable_fact"
    };
  }

  const item = menuFacts.items.find((candidate) => candidate.id === factId);

  if (item?.itemType === "dish" && item.orderability === "standalone") {
    return {
      kind: "item",
      fact: item
    };
  }

  if (item) {
    return {
      rejectionReason: "non_selectable_fact"
    };
  }

  return {
    rejectionReason: "invalid_fact_id"
  };
}

function isBlockedByProfile(selectedFact: SelectedFact, profile: UserProfile, menuFacts: MenuFacts) {
  return Boolean(
    blockReasonForRecommendation(
      toProfileRuleInput(selectedFact, menuFacts),
      profile
    )
  );
}

function toAnalyzeDataParts(selectedRecommendations: SelectedRecommendation[]): {
  dishes: Dish[];
  recommendations: Recommendation[];
} {
  const dishes: Dish[] = selectedRecommendations.map((selected, index) => {
    const fact = selected.fact.fact;

    return {
      id: `ai_fact_${String(index + 1).padStart(3, "0")}`,
      nameOriginal: getOriginalName(selected.fact),
      descriptionOriginal: fact.descriptionOriginal,
      price: fact.priceRaw ? parsePrice(fact.priceRaw) : undefined,
      category: selected.fact.kind === "unit" ? "KI-Menueempfehlung" : "KI-Empfehlung",
      sourceLine: fact.evidence
    };
  });

  const recommendations: Recommendation[] = selectedRecommendations.map((selected, index) => ({
    dishId: dishes[index]!.id,
    reason: selected.reason,
    translatedName: getTranslatedName(selected.fact) ?? ""
  }));

  return {
    dishes,
    recommendations
  };
}

function getOriginalName(selectedFact: SelectedFact) {
  return selectedFact.kind === "unit"
    ? selectedFact.fact.titleOriginal
    : selectedFact.fact.nameOriginal;
}

function getTranslatedName(selectedFact: SelectedFact) {
  return selectedFact.fact.translatedName;
}

function toProfileRuleInput(selectedFact: SelectedFact, menuFacts: MenuFacts) {
  const fact = selectedFact.fact;
  const includedItems = selectedFact.kind === "unit"
    ? getIncludedMenuItems(selectedFact.fact, menuFacts)
    : [];

  return {
    nameOriginal: getOriginalName(selectedFact),
    descriptionOriginal: [
      fact.descriptionOriginal,
      ...includedItems.map((item) => [item.nameOriginal, item.descriptionOriginal].filter(Boolean).join(" "))
    ]
      .filter(Boolean)
      .join(" "),
    category: fact.itemType,
    sourceLine: [
      fact.evidence,
      ...includedItems.map((item) => item.evidence)
    ]
      .filter(Boolean)
      .join(" "),
    evidence: [
      fact.evidence,
      ...includedItems.map((item) => item.evidence)
    ]
      .filter(Boolean)
      .join(" ")
  };
}

function getIncludedMenuItems(menuUnit: MenuUnitFact, menuFacts: MenuFacts) {
  const includedIds = new Set(menuUnit.includedItemIds ?? []);

  return menuFacts.items.filter((item) => item.parentMenuUnitId === menuUnit.id || includedIds.has(item.id));
}

function inferRecommendationMode(selectedRecommendations: SelectedRecommendation[]): RecommendationMode {
  const selectedMenuUnit = selectedRecommendations.find((recommendation) => recommendation.fact.kind === "unit");

  if (selectedMenuUnit?.fact.kind === "unit") {
    return selectedMenuUnit.fact.fact.itemType === "sharing_menu" ? "sharing_menu" : "whole_menu";
  }

  return selectedRecommendations.length > 0 ? "single_dishes" : undefined;
}

function getConciergeCompass({
  conciergeCompass,
  menuFacts,
  recommendationMode,
  selectedRecommendations
}: {
  conciergeCompass: string | undefined;
  menuFacts: MenuFacts;
  recommendationMode: RecommendationMode;
  selectedRecommendations: SelectedRecommendation[];
}) {
  const cleanedCompass = conciergeCompass?.trim();

  if (cleanedCompass) {
    return cleanedCompass;
  }

  if (selectedRecommendations.length === 0) {
    return undefined;
  }

  if (recommendationMode !== "whole_menu" && recommendationMode !== "sharing_menu") {
    return undefined;
  }

  const hasMenuCourses = menuFacts.items.some(
    (item) => item.itemType === "course" || item.orderability === "part_of_menu"
  );

  if (hasMenuCourses) {
    return "Das wirkt hier eher wie ein Menü-Erlebnis als wie eine klassische Speisekarte. Ich würde deshalb nicht einzelne Gänge herauspicken, sondern die Menüeinheit nehmen.";
  }

  return "Das wirkt hier eher wie eine bestellbare Menüeinheit als wie eine Liste einzelner Gerichte. Ich würde sie als zusammenhängende Empfehlung betrachten.";
}

function parsePrice(priceRaw: string) {
  const match = priceRaw.match(/(\d{1,3})(?:[,.](\d{2}))?/);

  if (!match) {
    return undefined;
  }

  const euros = match[1];
  const cents = match[2] ?? "00";
  const value = Number(`${euros}.${cents}`);

  return Number.isFinite(value) ? value : undefined;
}
