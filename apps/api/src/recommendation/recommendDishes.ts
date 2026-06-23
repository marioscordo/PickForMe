import type { Dish } from "../types/menu";
import type { Recommendation } from "../types/recommendations";
import type { Situation, UserProfile } from "../types/profile";

export function recommendDishes({
  dishes,
  profile,
  situation
}: {
  dishes: Dish[];
  profile: UserProfile;
  situation: Situation;
}): Recommendation[] {
  const scored = dishes
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
  const text = `${dish.nameOriginal} ${dish.descriptionOriginal ?? ""} ${dish.category ?? ""}`.toLowerCase();
  let score = 0;

  for (const like of [...profile.primaryLikes, ...profile.secondaryLikes]) {
    if (text.includes(like.toLowerCase())) {
      score += profile.primaryLikes.includes(like) ? 6 : 3;
    }
  }

  for (const dislike of profile.dislikes) {
    if (text.includes(dislike.toLowerCase())) {
      score -= 12;
    }
  }

  for (const intolerance of profile.intolerances) {
    if (text.includes(intolerance.toLowerCase())) {
      score -= 20;
    }
  }

  if (situation === "regional" && matchesAny(text, ["regional", "fränkisch", "hausgemacht", "schäufele", "braten"])) {
    score += 5;
  }

  if (situation === "leicht" && matchesAny(text, ["salat", "gemüse", "fisch", "leicht"])) {
    score += 5;
  }

  if (situation === "teilen" && matchesAny(text, ["platte", "variation", "antipasti", "tapas", "zum teilen"])) {
    score += 5;
  }

  if (situation === "überraschen") {
    score += dish.id.endsWith("3") ? 2 : 0;
  }

  return score;
}

function buildReason(dish: Dish, profile: UserProfile, situation: Situation) {
  const text = `${dish.nameOriginal} ${dish.descriptionOriginal ?? ""} ${dish.category ?? ""}`.toLowerCase();
  const matchedLike = profile.primaryLikes.find((like) => text.includes(like.toLowerCase()));

  if (matchedLike) {
    return `Passt zu Marios Vorliebe für ${matchedLike}.`;
  }

  if (situation === "regional") {
    return "Wirkt passend für eine regionale Auswahl aus der Karte.";
  }

  if (situation === "leicht") {
    return "Wirkt passend, wenn es heute etwas leichter sein soll.";
  }

  if (situation === "teilen") {
    return "Wirkt passend, wenn am Tisch geteilt werden soll.";
  }

  return "Interessante Option aus der erkannten Karte.";
}

function matchesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}
