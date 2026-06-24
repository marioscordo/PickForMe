import type { Dish } from "../types/menu";
import type { Recommendation } from "../types/recommendations";
import type { Situation, UserProfile } from "../types/profile";
import {
  appetiteMoodScoreForDish,
  blockReasonForDish,
  preferenceMatchesDish
} from "../profile/profileRules";

export function recommendDishes({
  dishes,
  profile,
  situation
}: {
  dishes: Dish[];
  profile: UserProfile;
  situation: Situation;
}): Recommendation[] {
  const safeDishes = dishes.filter((dish) => !blockReasonForDish(dish, profile));

  const scored = safeDishes
    .map((dish) => ({
      dish,
      score: scoreDish(dish, profile, situation)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ dish }) => ({
    dishId: dish.id,
    reason: buildReason(dish, profile, situation)
  }));
}

function scoreDish(dish: Dish, profile: UserProfile, situation: Situation) {
  let score = 0;
  const activeLikes = [...(profile.primaryLikes ?? []), ...(profile.secondaryLikes ?? [])];

  for (const like of activeLikes) {
    if (preferenceMatchesDish(dish, like)) {
      score += profile.primaryLikes.includes(like) ? 6 : 3;
    }
  }

  score += appetiteMoodScoreForDish(dish, profile.appetiteMood);

  const text = `${dish.nameOriginal} ${dish.descriptionOriginal ?? ""} ${dish.category ?? ""}`.toLowerCase();

  if (situation === "richtig_hunger" && matchesAny(text, ["regional", "fränkisch", "fraenkisch", "hausgemacht", "schäufele", "schaeufele", "braten"])) {
    score += 5;
  }

  if (situation === "leicht" && matchesAny(text, ["salat", "gemüse", "gemuese", "fisch", "leicht", "bowl"])) {
    score += 5;
  }

  if (situation === "neues_probieren" && matchesAny(text, ["platte", "variation", "antipasti", "tapas", "zum teilen"])) {
    score += 5;
  }

  if (situation === "neues_probieren") {
    score += matchesAny(text, ["spezial", "hausgemacht", "variation", "chef", "tempura", "curry"]) ? 3 : 0;
  }

  return score;
}

function buildReason(dish: Dish, profile: UserProfile, situation: Situation) {
  const matchedLike = (profile.primaryLikes ?? []).find((like) => preferenceMatchesDish(dish, like));

  if (matchedLike) {
    return `Passt zu Deiner Vorliebe für ${matchedLike}.`;
  }

  if (profile.appetiteMood === "richtig_hunger") {
    return "Wirkt passend, wenn Du richtig Hunger hast.";
  }

  if (profile.appetiteMood === "leicht") {
    return "Wirkt passend, wenn es heute etwas Leichteres sein soll.";
  }

  if (profile.appetiteMood === "neues_probieren") {
    return "Wirkt passend, wenn Du etwas Neues probieren möchtest.";
  }

  if (profile.appetiteMood === "sicher") {
    return "Wirkt passend, wenn Du auf Nummer sicher gehen möchtest.";
  }

  if (situation === "richtig_hunger") {
    return "Wirkt passend für eine regionale Auswahl aus der Karte.";
  }

  if (situation === "leicht") {
    return "Wirkt passend, wenn es heute etwas leichter sein soll.";
  }

  if (situation === "neues_probieren") {
    return "Wirkt passend, wenn am Tisch geteilt werden soll.";
  }

  return "Interessante Option aus der erkannten Karte.";
}

function matchesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

