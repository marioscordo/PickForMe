import type { Dish } from "../types/menu";
import type { Situation, UserProfile } from "../types/profile";
import type { Recommendation } from "../types/recommendations";
import type { MenuFacts, MenuItemFact, MenuUnitFact } from "../types/menuFacts";
import { blockReasonForRecommendation } from "../profile/profileRules";
import { isAiEnabled } from "../config/aiFeatureFlag";
import {
  askConciergeRecommendationAI,
  type ConciergeRecommendationResult
} from "./askConciergeRecommendationAI";
import { extractMenuFactsFromTextAI } from "./extractMenuFactsFromTextAI";

const SUMMARY_LABEL = "GustaroAI two-step text AI summary";
const MAX_CONCIERGE_STANDALONE_DISHES = 40;

type TextAiAnalyzeResult = {
  dishes: Dish[];
  recommendations: Recommendation[];
  conciergeHero?: string;
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
  facts: string;
};

type FactLookupResult =
  | SelectedFact
  | {
      rejectionReason: "invalid_fact_id" | "non_selectable_fact";
    };

export async function askPickForMeAI({
  menuText,
  profile,
  situation,
  signal,
  userLocale
}: {
  menuText: string;
  profile: UserProfile;
  situation: Situation;
  signal?: AbortSignal;
  userLocale?: string;
}): Promise<TextAiAnalyzeResult> {
  if (!isAiEnabled()) {
    throw new Error("GustaroAI AI ist nicht aktiviert.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const menuFacts = await extractMenuFactsFromTextAI(menuText, { signal, userLocale });
  const conciergeMenuFacts = buildConciergeMenuFacts(menuFacts, profile);
  const conciergeRecommendation = await askConciergeRecommendationAI({
    menuFacts: conciergeMenuFacts,
    profile,
    situation,
    signal
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
      reason: recommendation.reason,
      facts: buildFactsText(lookupResult, menuFacts)
    });
  }

  const recommendationMode =
    conciergeRecommendation.recommendationMode ?? inferRecommendationMode(selectedRecommendations);
  const conciergeHero = conciergeRecommendation.conciergeHero?.trim();

  if (process.env.NODE_ENV !== "production") {
    console.log(SUMMARY_LABEL, {
      menuTextLength: menuText.length,
      items: menuFacts.items.length,
      menuUnits: menuFacts.menuUnits.length,
      conciergeItems: conciergeMenuFacts.items.length,
      conciergeMenuUnits: conciergeMenuFacts.menuUnits.length,
      selectedRecommendations: selectedRecommendations.length,
      returnsEmpty: selectedRecommendations.length === 0,
      hasConciergeHero: Boolean(conciergeHero),
      recommendationMode,
      menuTypePresent: Boolean(menuFacts.menuType?.trim())
    });
  }

  return {
    ...toAnalyzeDataParts(selectedRecommendations),
    conciergeHero,
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

function buildConciergeMenuFacts(menuFacts: MenuFacts, profile: UserProfile): MenuFacts {
  const menuUnits = menuFacts.menuUnits.filter((unit) => unit.orderability === "standalone");
  const includedItemIds = new Set(menuUnits.flatMap((unit) => unit.includedItemIds ?? []));
  const menuUnitContextItems = menuFacts.items.filter(
    (item) => item.parentMenuUnitId && menuUnits.some((unit) => unit.id === item.parentMenuUnitId)
      || includedItemIds.has(item.id)
  );
  const standaloneDishCandidates = menuFacts.items
    .filter((item) => item.itemType === "dish" && item.orderability === "standalone")
    .filter((item) => !isBlockedByProfile({ kind: "item", fact: item }, profile, menuFacts))
    .sort((a, b) => scoreConciergeCandidate(b) - scoreConciergeCandidate(a))
    .slice(0, MAX_CONCIERGE_STANDALONE_DISHES);
  const itemIds = new Set<string>();
  const items = [...menuUnitContextItems, ...standaloneDishCandidates].filter((item) => {
    if (itemIds.has(item.id)) {
      return false;
    }

    itemIds.add(item.id);
    return true;
  });

  return {
    menuType: menuFacts.menuType,
    items,
    menuUnits
  };
}

function scoreConciergeCandidate(item: MenuItemFact) {
  let score = 0;

  if (item.descriptionOriginal) score += 3;
  if (item.translatedName) score += 2;
  if (item.priceRaw) score += 1;
  if (item.evidence) score += 1;

  return score;
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
    rank: selected.rank,
    reason: selected.reason,
    facts: selected.facts,
    translatedName: getTranslatedName(selected.fact) ?? getOriginalName(selected.fact)
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

function buildFactsText(selectedFact: SelectedFact, menuFacts: MenuFacts) {
  const fact = selectedFact.fact;
  const includedItems = selectedFact.kind === "unit"
    ? getIncludedMenuItems(selectedFact.fact, menuFacts)
    : [];
  const parts = [
    getOriginalName(selectedFact),
    fact.translatedName,
    fact.descriptionOriginal,
    ...includedItems.flatMap((item) => [
      item.nameOriginal,
      item.translatedName,
      item.descriptionOriginal
    ])
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return Array.from(new Set(parts)).join("\n");
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
