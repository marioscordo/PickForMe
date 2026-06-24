import React, { createContext, useContext, useMemo, useState } from "react";
import type { UserProfile } from "../../types/profile";

const defaultProfile: UserProfile = {
  displayName: "Mario",
  primaryLikes: ["Fleisch", "Fisch", "Große Portionen"],
  secondaryLikes: ["Pasta", "Salat", "Scharf"],
  dislikes: ["Keine Innereien", "Kein Grätenfisch"],
  intolerances: [],
  dietStyle: "normal",
  appetiteMood: "richtig_hunger",
  exceptions: [],

  customPreferences: [],
  customExclusions: [],
  customIntolerances: [],
  customExceptions: [],

  hiddenPreferences: [],
  hiddenExclusions: [],
  hiddenIntolerances: [],
  hiddenExceptions: []
};

type ProfileContextValue = {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);

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
