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

const SUMMARY_LABEL = "GustaroAI two-step text AI summary";

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

type PrioritizedMenuItem = {
  item: MenuItemFact;
  score: number;
  strongPreferenceScore: number;
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
  if (process.env.GUSTAROAI_AI_ENABLED !== "true") {
    throw new Error("GustaroAI AI ist nicht aktiviert.");
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const menuFacts = await extractMenuFactsFromTextAI(menuText, { signal, userLocale });
  const conciergeMenuFacts = buildConciergeMenuFacts(menuFacts, profile, situation);
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

  const governedRecommendations = applyStructuredRecommendationPriority({
    selectedRecommendations,
    menuFacts,
    conciergeMenuFacts,
    profile,
    situation
  });
  const recommendationMode =
    conciergeRecommendation.recommendationMode ?? inferRecommendationMode(governedRecommendations);
  const conciergeHero = conciergeRecommendation.conciergeHero?.trim();

  if (process.env.NODE_ENV !== "production") {
    console.log(SUMMARY_LABEL, {
      menuTextLength: menuText.length,
      items: menuFacts.items.length,
      menuUnits: menuFacts.menuUnits.length,
      conciergeItems: conciergeMenuFacts.items.length,
      conciergeMenuUnits: conciergeMenuFacts.menuUnits.length,
      selectedRecommendations: governedRecommendations.length,
      returnsEmpty: governedRecommendations.length === 0,
      hasConciergeHero: Boolean(conciergeHero),
      recommendationMode,
      menuTypePresent: Boolean(menuFacts.menuType?.trim())
    });
  }

  return {
    ...toAnalyzeDataParts(governedRecommendations),
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

function buildConciergeMenuFacts(menuFacts: MenuFacts, profile: UserProfile, situation: Situation): MenuFacts {
  const menuUnits = situation === "leicht"
    ? []
    : menuFacts.menuUnits
        .filter((unit) => unit.orderability === "standalone")
        .filter((unit) => !isBlockedByProfile({ kind: "unit", fact: unit }, profile, menuFacts));
  const includedItemIds = new Set(menuUnits.flatMap((unit) => unit.includedItemIds ?? []));
  const menuUnitContextItems = menuFacts.items.filter(
    (item) => item.parentMenuUnitId && menuUnits.some((unit) => unit.id === item.parentMenuUnitId)
      || includedItemIds.has(item.id)
  ).filter((item) => !isBlockedByProfile({ kind: "item", fact: item }, profile, menuFacts));
  const standaloneDishCandidates = menuFacts.items
    .filter((item) => isConciergeCandidateForSituation(item, situation))
    .filter((item) => !isBlockedByProfile({ kind: "item", fact: item }, profile, menuFacts))
    .sort((left, right) =>
      scoreConciergeCandidate(right, profile, situation).score -
      scoreConciergeCandidate(left, profile, situation).score
    );
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

function isConciergeCandidateForSituation(item: MenuItemFact, situation: Situation) {
  if (item.itemType !== "dish" || item.orderability !== "standalone") {
    return false;
  }

  if (situation === "leicht") {
    return item.isLightDishCandidate === true ||
      item.dishRole === "starter" ||
      item.mealType === "salad";
  }

  return item.isMainCourseCandidate === true ||
    (
      item.dishRole === "main" &&
      item.substanceLevel !== "light" &&
      item.mealType !== "salad"
    );
}

function applyStructuredRecommendationPriority({
  selectedRecommendations,
  menuFacts,
  conciergeMenuFacts,
  profile,
  situation
}: {
  selectedRecommendations: SelectedRecommendation[];
  menuFacts: MenuFacts;
  conciergeMenuFacts: MenuFacts;
  profile: UserProfile;
  situation: Situation;
}) {
  if (selectedRecommendations.some((recommendation) => recommendation.fact.kind === "unit")) {
    return normalizeRecommendationRanks(selectedRecommendations);
  }

  const prioritizedItems = getPrioritizedStandaloneDishCandidates(conciergeMenuFacts, profile, situation);

  if (prioritizedItems.length === 0) {
    return normalizeRecommendationRanks(selectedRecommendations);
  }

  const priorityByItemId = new Map(prioritizedItems.map((candidate) => [candidate.item.id, candidate]));
  const sortedSelectedRecommendations = [...selectedRecommendations].sort((left, right) => left.rank - right.rank);
  const firstSelectedItem = sortedSelectedRecommendations.find(
    (recommendation) => recommendation.fact.kind === "item"
  )?.fact.fact;
  const firstSelectedPriority = firstSelectedItem ? priorityByItemId.get(firstSelectedItem.id) : undefined;
  const topPriority = prioritizedItems[0]!;
  const strongPreferenceMustLead = topPriority.strongPreferenceScore > 0;
  const shouldPromoteTopPriority =
    sortedSelectedRecommendations.length === 0 ||
    (
      strongPreferenceMustLead &&
      (!firstSelectedPriority || firstSelectedPriority.strongPreferenceScore < topPriority.strongPreferenceScore)
    );
  const nextRecommendations: SelectedRecommendation[] = [];
  const usedFactKeys = new Set<string>();

  if (shouldPromoteTopPriority) {
    addSelectedRecommendation(
      nextRecommendations,
      usedFactKeys,
      buildSelectedRecommendationFromItem(topPriority.item, 1, menuFacts)
    );
  }

  for (const recommendation of sortedSelectedRecommendations) {
    addSelectedRecommendation(nextRecommendations, usedFactKeys, recommendation);
  }

  for (const candidate of prioritizedItems) {
    if (nextRecommendations.length >= 3) {
      break;
    }

    addSelectedRecommendation(
      nextRecommendations,
      usedFactKeys,
      buildSelectedRecommendationFromItem(candidate.item, nextRecommendations.length + 1, menuFacts)
    );
  }

  return normalizeRecommendationRanks(nextRecommendations.slice(0, 3));
}

function getPrioritizedStandaloneDishCandidates(
  menuFacts: MenuFacts,
  profile: UserProfile,
  situation: Situation
) {
  return menuFacts.items
    .filter((item) => isConciergeCandidateForSituation(item, situation))
    .map((item) => ({
      item,
      ...scoreConciergeCandidate(item, profile, situation)
    }))
    .sort((left, right) => right.score - left.score);
}

function scoreConciergeCandidate(item: MenuItemFact, profile: UserProfile, situation: Situation): Omit<PrioritizedMenuItem, "item"> {
  const strongPreferenceScore = preferenceScoreForItem(item, uniquePreferences([
    ...(profile.primaryLikes ?? []),
    ...(profile.customPreferences ?? [])
  ]), 90);
  const secondaryPreferenceScore = preferenceScoreForItem(item, uniquePreferences(profile.secondaryLikes ?? []), 24);
  const structuralScore = structuralScoreForItem(item, situation);
  const score = strongPreferenceScore + secondaryPreferenceScore + structuralScore;

  return {
    score,
    strongPreferenceScore
  };
}

function structuralScoreForItem(item: MenuItemFact, situation: Situation) {
  let score = (item.classificationConfidence ?? 0) * 10;

  if (item.isMainCourseCandidate) {
    score += 30;
  }

  if (item.dishRole === "main") {
    score += 18;
  }

  if (item.substanceLevel === "substantial") {
    score += situation === "richtig_hunger" ? 55 : 28;
  } else if (item.substanceLevel === "medium") {
    score += situation === "richtig_hunger" ? 25 : 14;
  } else if (item.substanceLevel === "light") {
    score += situation === "leicht" ? 35 : -45;
  }

  if (situation === "leicht") {
    if (item.isLightDishCandidate) {
      score += 45;
    }

    if (item.dishRole === "starter") {
      score += 28;
    }

    if (item.mealType === "salad") {
      score += 28;
    }
  } else if (item.isLightDishCandidate || item.mealType === "salad") {
    score -= 80;
  }

  return score;
}

function preferenceScoreForItem(item: MenuItemFact, preferences: string[], weight: number) {
  let score = 0;

  for (const preference of preferences) {
    if (structuredPreferenceMatchesItem(item, preference)) {
      score += weight;
    }
  }

  return score;
}

function structuredPreferenceMatchesItem(item: MenuItemFact, preference: string) {
  const normalizedPreference = normalizePreference(preference);

  if (!normalizedPreference) {
    return false;
  }

  if (normalizedPreference.includes("fleisch") || normalizedPreference.includes("meat")) {
    return item.mealType === "meat";
  }

  if (normalizedPreference.includes("fisch") || normalizedPreference.includes("fish")) {
    return item.mealType === "fish";
  }

  if (normalizedPreference.includes("protein")) {
    return item.mealType === "meat" ||
      item.mealType === "fish" ||
      item.substanceLevel === "medium" ||
      item.substanceLevel === "substantial";
  }

  if (
    normalizedPreference.includes("portion") ||
    normalizedPreference.includes("gross") ||
    normalizedPreference.includes("grosse") ||
    normalizedPreference.includes("large")
  ) {
    return item.substanceLevel === "substantial" || item.isMainCourseCandidate === true;
  }

  if (normalizedPreference.includes("pasta")) {
    return item.mealType === "pasta";
  }

  if (normalizedPreference.includes("salat") || normalizedPreference.includes("salad")) {
    return item.mealType === "salad";
  }

  if (normalizedPreference.includes("pizza")) {
    return item.mealType === "pizza";
  }

  return false;
}

function normalizePreference(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss")
    .trim();
}

function uniquePreferences(preferences: string[]) {
  return Array.from(new Set(preferences.map((preference) => preference.trim()).filter(Boolean)));
}

function buildSelectedRecommendationFromItem(
  item: MenuItemFact,
  rank: number,
  menuFacts: MenuFacts
): SelectedRecommendation {
  const selectedFact: SelectedFact = {
    kind: "item",
    fact: item
  };

  return {
    fact: selectedFact,
    rank,
    reason: rank === 1 ? "Erste Empfehlung aus den sicheren Optionen." : "Weitere sichere Option.",
    facts: buildFactsText(selectedFact, menuFacts)
  };
}

function addSelectedRecommendation(
  recommendations: SelectedRecommendation[],
  usedFactKeys: Set<string>,
  recommendation: SelectedRecommendation
) {
  const key = selectedFactKey(recommendation.fact);

  if (usedFactKeys.has(key)) {
    return;
  }

  usedFactKeys.add(key);
  recommendations.push(recommendation);
}

function selectedFactKey(selectedFact: SelectedFact) {
  return `${selectedFact.kind}:${selectedFact.fact.id}`;
}

function normalizeRecommendationRanks(recommendations: SelectedRecommendation[]) {
  return recommendations
    .slice(0, 3)
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1
    }));
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
    const itemFact = getItemFact(selected.fact);

    return {
      id: `ai_fact_${String(index + 1).padStart(3, "0")}`,
      nameOriginal: getOriginalName(selected.fact),
      descriptionOriginal: fact.descriptionOriginal,
      price: fact.priceRaw ? parsePrice(fact.priceRaw) : undefined,
      category: selected.fact.kind === "unit" ? "KI-Menueempfehlung" : "KI-Empfehlung",
      itemType: getDishItemType(itemFact),
      dishRole: itemFact?.dishRole,
      mealType: itemFact?.mealType,
      substanceLevel: itemFact?.substanceLevel,
      isMainCourseCandidate: itemFact?.isMainCourseCandidate,
      isLightDishCandidate: itemFact?.isLightDishCandidate,
      classificationConfidence: itemFact?.classificationConfidence,
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
  const itemFact = getItemFact(selectedFact);
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
    itemType: getDishItemType(itemFact),
    dishRole: itemFact?.dishRole,
    mealType: itemFact?.mealType,
    substanceLevel: itemFact?.substanceLevel,
    isMainCourseCandidate: itemFact?.isMainCourseCandidate,
    isLightDishCandidate: itemFact?.isLightDishCandidate,
    classificationConfidence: itemFact?.classificationConfidence,
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

function getItemFact(selectedFact: SelectedFact) {
  return selectedFact.kind === "item" ? selectedFact.fact : undefined;
}

function getDishItemType(item: MenuItemFact | undefined) {
  if (!item || item.itemType === "course") {
    return undefined;
  }

  return item.itemType;
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
