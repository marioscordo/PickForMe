import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_OUTPUT_LOCALE } from "../../config/outputLocales";
import {
  filterControlledProfileValues,
  splitGlobalAllergens
} from "../../profile/profileInputPolicy";
import type { UserProfile } from "../../types/profile";

const PROFILE_STORAGE_KEY = "gustaroai:user-profile:v1";

const defaultProfile: UserProfile = {
  displayName: "Mario",
  primaryLikes: ["Fleisch", "Fisch"],
  secondaryLikes: ["Pasta", "Salat"],
  dislikes: ["Keine Innereien", "Kein Grätenfisch", "Kein Lamm"],
  intolerances: [],
  dietStyle: "normal",
  outputLocale: DEFAULT_OUTPUT_LOCALE,
  appetiteMood: "leicht",
  customPreferences: [],
  customExclusions: [],
  customIntolerances: [],
  allergens: [],

  hiddenPreferences: [],
  hiddenExclusions: [],
  hiddenIntolerances: [],
  hiddenAllergens: []
};

type ProfileContextValue = {
  profile: UserProfile;
  setProfile: (profile: UserProfile | ((current: UserProfile) => UserProfile)) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(defaultProfile);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(PROFILE_STORAGE_KEY)
      .then((storedProfile) => {
        if (!active) {
          return;
        }

        setProfileState(mergeStoredProfile(storedProfile));
      })
      .catch(() => {
        if (active) {
          setProfileState(defaultProfile);
        }
      })
      .finally(() => {
        if (active) {
          setProfileLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profileLoaded) {
      return;
    }

    AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile)).catch(() => {
      // Profile changes remain available in memory for the current session.
    });
  }, [profile, profileLoaded]);

  function setProfile(nextProfile: UserProfile | ((current: UserProfile) => UserProfile)) {
    setProfileState((currentProfile) =>
      normalizeProfile(typeof nextProfile === "function" ? nextProfile(currentProfile) : nextProfile)
    );
  }

  const value = useMemo(
    () => ({
      profile,
      setProfile
    }),
    [profile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);

  if (!value) {
    throw new Error("useProfile muss innerhalb von ProfileProvider genutzt werden.");
  }

  return value;
}

function mergeStoredProfile(storedProfile: string | null): UserProfile {
  if (!storedProfile) {
    return defaultProfile;
  }

  try {
    const parsed = JSON.parse(storedProfile) as Partial<UserProfile>;

    return normalizeProfile({
      ...defaultProfile,
      ...parsed
    });
  } catch {
    return defaultProfile;
  }
}

function normalizeProfile(profile: Partial<UserProfile>): UserProfile {
  const splitIntolerances = splitGlobalAllergens(stringArray(profile.intolerances));
  const splitCustomIntolerances = splitGlobalAllergens(stringArray(profile.customIntolerances));
  const splitHiddenIntolerances = splitGlobalAllergens(stringArray(profile.hiddenIntolerances));
  const allergens = [
    ...stringArray(profile.allergens),
    ...splitIntolerances.allergens,
    ...splitCustomIntolerances.allergens
  ];

  return {
    ...defaultProfile,
    ...profile,
    displayName: typeof profile.displayName === "string" && profile.displayName.trim()
      ? profile.displayName
      : defaultProfile.displayName,
    primaryLikes: filterControlledProfileValues(stringArray(profile.primaryLikes)),
    secondaryLikes: stringArray(profile.secondaryLikes),
    dislikes: filterControlledProfileValues(stringArray(profile.dislikes)),
    intolerances: filterControlledProfileValues(splitIntolerances.rest),
    dietStyle: isDietStyle(profile.dietStyle) ? profile.dietStyle : defaultProfile.dietStyle,
    outputLocale: typeof profile.outputLocale === "string" && profile.outputLocale.trim()
      ? profile.outputLocale
      : defaultProfile.outputLocale,
    appetiteMood: isAppetiteMood(profile.appetiteMood) ? profile.appetiteMood : defaultProfile.appetiteMood,
    customPreferences: filterControlledProfileValues(stringArray(profile.customPreferences)),
    customExclusions: filterControlledProfileValues(stringArray(profile.customExclusions)),
    customIntolerances: filterControlledProfileValues(splitCustomIntolerances.rest),
    allergens: uniqueValues(filterControlledProfileValues(allergens)),
    hiddenPreferences: stringArray(profile.hiddenPreferences),
    hiddenExclusions: stringArray(profile.hiddenExclusions),
    hiddenIntolerances: splitHiddenIntolerances.rest,
    hiddenAllergens: uniqueValues([
      ...stringArray(profile.hiddenAllergens),
      ...splitHiddenIntolerances.allergens
    ])
  };
}

function stringArray(values: unknown) {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function isDietStyle(value: unknown): value is UserProfile["dietStyle"] {
  return value === "normal" || value === "vegetarisch" || value === "vegan" || value === "flexitarisch";
}

function isAppetiteMood(value: unknown): value is UserProfile["appetiteMood"] {
  return value === "richtig_hunger" || value === "leicht" || value === "neues_probieren" || value === "sicher";
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => item.trim().toLowerCase() === value.trim().toLowerCase())
      ? result
      : [...result, value];
  }, []);
}
