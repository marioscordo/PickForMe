import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_OUTPUT_LOCALE } from "../../config/outputLocales";
import { filterControlledProfileValues } from "../../profile/profileInputPolicy";
import type { UserProfile } from "../../types/profile";

const PROFILE_STORAGE_KEY = "gustaroai:user-profile:v1";

const defaultProfile: UserProfile = {
  displayName: "",
  primaryLikes: [],
  outputLocale: DEFAULT_OUTPUT_LOCALE,
  appetiteMood: "leicht",
  customExclusions: [],
  allergens: [],

  hiddenPreferences: [],
  hiddenExclusions: [],
  hiddenAllergens: [],
  deletedPreferences: [],
  deletedExclusions: []
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

    AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(toStoredProfile(profile))).catch(() => {
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

    return normalizeProfile(parsed);
  } catch {
    return defaultProfile;
  }
}

function normalizeProfile(profile: Partial<UserProfile>): UserProfile {
  return {
    displayName: typeof profile.displayName === "string" && profile.displayName.trim()
      ? profile.displayName
      : defaultProfile.displayName,
    primaryLikes: uniqueValues(filterControlledProfileValues(stringArray(profile.primaryLikes))),
    outputLocale: typeof profile.outputLocale === "string" && profile.outputLocale.trim()
      ? profile.outputLocale
      : defaultProfile.outputLocale,
    appetiteMood: isAppetiteMood(profile.appetiteMood) ? profile.appetiteMood : defaultProfile.appetiteMood,
    customExclusions: uniqueValues(filterControlledProfileValues(stringArray(profile.customExclusions))),
    allergens: uniqueValues(filterControlledProfileValues(stringArray(profile.allergens))),
    hiddenPreferences: stringArray(profile.hiddenPreferences),
    hiddenExclusions: stringArray(profile.hiddenExclusions),
    hiddenAllergens: stringArray(profile.hiddenAllergens),
    deletedPreferences: stringArray(profile.deletedPreferences),
    deletedExclusions: stringArray(profile.deletedExclusions)
  };
}

function toStoredProfile(profile: UserProfile): UserProfile {
  return normalizeProfile(profile);
}

function stringArray(values: unknown) {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function isAppetiteMood(value: unknown): value is UserProfile["appetiteMood"] {
  return value === "richtig_hunger" || value === "leicht" || value === "neues_probieren" || value === "sicher";
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeProfileValue(item) === normalizeProfileValue(value))
      ? result
      : [...result, value];
  }, []);
}

function normalizeProfileValue(value: string) {
  return value.trim().normalize("NFC").toLowerCase();
}
