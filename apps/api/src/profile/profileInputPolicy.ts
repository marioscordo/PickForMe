import { profileFeatures } from "../config/profileFeatures";
import {
  classifyProfileInputDeterministically
} from "../ai/classifyProfilePreferenceAI";
import type { UserProfile } from "../types/profile";

export function sanitizeProfileForRecommendation(profile: UserProfile): UserProfile {
  const customExclusions = filterControlledProfileValues(profile.customExclusions ?? []);
  const primaryLikes = excludeConflictingLikes(
    filterControlledProfileValues(profile.primaryLikes),
    customExclusions
  );
  const allergens = uniqueValues(filterControlledProfileValues(profile.allergens ?? []));

  return {
    displayName: profile.displayName,
    outputLocale: profile.outputLocale,
    primaryLikes,
    customExclusions,
    allergens: profileFeatures.allergenModuleEnabled ? allergens : []
  };
}

// Ausschluesse sind staerker als Vorlieben: steht derselbe Wert (z.B. durch
// eine alte Profil-Version) in beiden Listen, ginge sonst ein widerspruechlicher
// Prompt an die KI ("Aktive Vorlieben: Pilze" UND "Aktive Ausschluesse: Pilze").
// Statt uns nur auf die Text-Anweisung an die KI zu verlassen, loesen wir den
// Widerspruch hier deterministisch auf - der Ausschluss gewinnt, der Wert
// wird aus den Vorlieben entfernt, bevor der Prompt gebaut wird.
function excludeConflictingLikes(primaryLikes: string[], customExclusions: string[]) {
  return primaryLikes.filter(
    (like) =>
      !customExclusions.some(
        (exclusion) => normalizeProfileInputValue(exclusion) === normalizeProfileInputValue(like)
      )
  );
}

function filterControlledProfileValues(values: string[]) {
  return values.filter((value) => !classifyProfileInputDeterministically(value));
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeProfileInputValue(item) === normalizeProfileInputValue(value))
      ? result
      : [...result, value];
  }, []);
}

function normalizeProfileInputValue(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
