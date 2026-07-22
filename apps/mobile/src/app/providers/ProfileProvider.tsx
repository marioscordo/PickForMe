import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import { DEFAULT_OUTPUT_LOCALE } from "../../config/outputLocales";
import { filterControlledProfileValues } from "../../profile/profileInputPolicy";
import type { UserProfile } from "../../types/profile";

const PROFILE_STORAGE_KEY = "gustaroai:user-profile:v1";
const DEV_PROFILE_STORAGE_KEY = `${PROFILE_STORAGE_KEY}:dev`;
const LEGACY_PROFILE_MIGRATION_KEY = `${PROFILE_STORAGE_KEY}:legacy-migrated-to`;

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
  deletedExclusions: [],
  winePreference: {
    preferredTypes: [],
    taste: [],
    structure: [],
    favoriteGrapes: [],
    excludedStyles: []
  }
};

type ProfileContextValue = {
  profile: UserProfile;
  setProfile: (profile: UserProfile | ((current: UserProfile) => UserProfile)) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [profile, setProfileState] = useState<UserProfile>(defaultProfile);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const profileStorageKey = getProfileStorageKey(auth.state);

  useEffect(() => {
    if (!profileStorageKey) {
      setProfileState(defaultProfile);
      setProfileLoaded(false);
      return;
    }

    let active = true;
    setProfileState(defaultProfile);
    setProfileLoaded(false);

    loadStoredProfile(profileStorageKey, () => active)
      .then((storedProfile) => {
        if (!active || !storedProfile) {
          return;
        }

        setProfileState(storedProfile);
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
  }, [profileStorageKey]);

  useEffect(() => {
    if (!profileLoaded || !profileStorageKey) {
      return;
    }

    AsyncStorage.setItem(profileStorageKey, JSON.stringify(toStoredProfile(profile))).catch(() => {
      // Profile changes remain available in memory for the current session.
    });
  }, [profile, profileLoaded, profileStorageKey]);

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

function getProfileStorageKey(authState: ReturnType<typeof useAuth>["state"]) {
  if (authState.status === "authenticated") {
    return `${PROFILE_STORAGE_KEY}:${authState.userId}`;
  }

  if (authState.status === "dev") {
    return DEV_PROFILE_STORAGE_KEY;
  }

  return null;
}

async function loadStoredProfile(
  profileStorageKey: string,
  isActive: () => boolean
): Promise<UserProfile | null> {
  const storedProfile = await AsyncStorage.getItem(profileStorageKey);

  if (!isActive()) {
    return null;
  }

  if (storedProfile) {
    return mergeStoredProfile(storedProfile);
  }

  const migratedTo = await AsyncStorage.getItem(LEGACY_PROFILE_MIGRATION_KEY);

  if (!isActive()) {
    return null;
  }

  if (migratedTo) {
    return defaultProfile;
  }

  const legacyProfile = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);

  if (!isActive()) {
    return null;
  }

  if (!legacyProfile) {
    return defaultProfile;
  }

  await AsyncStorage.multiSet([
    [profileStorageKey, legacyProfile],
    [LEGACY_PROFILE_MIGRATION_KEY, profileStorageKey]
  ]);

  return mergeStoredProfile(legacyProfile);
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
    deletedExclusions: stringArray(profile.deletedExclusions),
    winePreference: normalizeWinePreference(profile.winePreference)
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

function normalizeWinePreference(value: unknown): NonNullable<UserProfile["winePreference"]> {
  const profile = typeof value === "object" && value !== null
    ? value as UserProfile["winePreference"]
    : {};

  return {
    preferredTypes: uniqueValues(stringArray(profile?.preferredTypes)),
    taste: uniqueValues(stringArray(profile?.taste)),
    structure: uniqueValues(stringArray(profile?.structure)),
    favoriteGrapes: uniqueValues(stringArray(profile?.favoriteGrapes)),
    excludedStyles: uniqueValues(stringArray(profile?.excludedStyles))
  };
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
