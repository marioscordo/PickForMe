import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_OUTPUT_LOCALE } from "../../config/outputLocales";
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
  appetiteMood: "richtig_hunger",
  customPreferences: [],
  customExclusions: [],
  customIntolerances: [],

  hiddenPreferences: [],
  hiddenExclusions: [],
  hiddenIntolerances: []
};

type ProfileContextValue = {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
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

  function setProfile(nextProfile: UserProfile) {
    setProfileState(normalizeProfile(nextProfile));
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
  return {
    ...defaultProfile,
    ...profile,
    displayName: typeof profile.displayName === "string" && profile.displayName.trim()
      ? profile.displayName
      : defaultProfile.displayName,
    primaryLikes: stringArray(profile.primaryLikes),
    secondaryLikes: stringArray(profile.secondaryLikes),
    dislikes: stringArray(profile.dislikes),
    intolerances: stringArray(profile.intolerances),
    dietStyle: isDietStyle(profile.dietStyle) ? profile.dietStyle : defaultProfile.dietStyle,
    outputLocale: typeof profile.outputLocale === "string" && profile.outputLocale.trim()
      ? profile.outputLocale
      : defaultProfile.outputLocale,
    appetiteMood: isAppetiteMood(profile.appetiteMood) ? profile.appetiteMood : defaultProfile.appetiteMood,
    customPreferences: stringArray(profile.customPreferences),
    customExclusions: stringArray(profile.customExclusions),
    customIntolerances: stringArray(profile.customIntolerances),
    hiddenPreferences: stringArray(profile.hiddenPreferences),
    hiddenExclusions: stringArray(profile.hiddenExclusions),
    hiddenIntolerances: stringArray(profile.hiddenIntolerances)
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
