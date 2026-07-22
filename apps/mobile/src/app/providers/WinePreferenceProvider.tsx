import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import type { WinePreference } from "../../types/winePreference";

const WINE_PREFERENCE_STORAGE_KEY = "gustaro-plus:wine-preference:v1";
const DEV_WINE_PREFERENCE_STORAGE_KEY = `${WINE_PREFERENCE_STORAGE_KEY}:dev`;

const defaultWinePreference: WinePreference = {
  preferredTypes: [],
  taste: [],
  structure: [],
  favoriteGrapes: [],
  excludedStyles: []
};

type WinePreferenceContextValue = {
  winePreference: WinePreference;
  setWinePreference: (winePreference: WinePreference | ((current: WinePreference) => WinePreference)) => void;
};

const WinePreferenceContext = createContext<WinePreferenceContextValue | null>(null);

export function WinePreferenceProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [winePreference, setWinePreferenceState] = useState<WinePreference>(defaultWinePreference);
  const [winePreferenceLoaded, setWinePreferenceLoaded] = useState(false);
  const winePreferenceStorageKey = getWinePreferenceStorageKey(auth.state);

  useEffect(() => {
    if (!winePreferenceStorageKey) {
      setWinePreferenceState(defaultWinePreference);
      setWinePreferenceLoaded(false);
      return;
    }

    let active = true;
    setWinePreferenceState(defaultWinePreference);
    setWinePreferenceLoaded(false);

    AsyncStorage.getItem(winePreferenceStorageKey)
      .then((storedWinePreference) => {
        if (!active || !storedWinePreference) {
          return;
        }

        setWinePreferenceState(normalizeWinePreference(JSON.parse(storedWinePreference)));
      })
      .catch(() => {
        if (active) {
          setWinePreferenceState(defaultWinePreference);
        }
      })
      .finally(() => {
        if (active) {
          setWinePreferenceLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [winePreferenceStorageKey]);

  useEffect(() => {
    if (!winePreferenceLoaded || !winePreferenceStorageKey) {
      return;
    }

    AsyncStorage.setItem(winePreferenceStorageKey, JSON.stringify(normalizeWinePreference(winePreference))).catch(() => {
      // Wine preference changes remain available in memory for the current session.
    });
  }, [winePreference, winePreferenceLoaded, winePreferenceStorageKey]);

  function setWinePreference(nextWinePreference: WinePreference | ((current: WinePreference) => WinePreference)) {
    setWinePreferenceState((currentWinePreference) =>
      normalizeWinePreference(
        typeof nextWinePreference === "function" ? nextWinePreference(currentWinePreference) : nextWinePreference
      )
    );
  }

  const value = useMemo(
    () => ({
      winePreference,
      setWinePreference
    }),
    [winePreference]
  );

  return <WinePreferenceContext.Provider value={value}>{children}</WinePreferenceContext.Provider>;
}

export function useWinePreference() {
  const value = useContext(WinePreferenceContext);

  if (!value) {
    throw new Error("useWinePreference muss innerhalb von WinePreferenceProvider genutzt werden.");
  }

  return value;
}

function getWinePreferenceStorageKey(authState: ReturnType<typeof useAuth>["state"]) {
  if (authState.status === "authenticated") {
    return `${WINE_PREFERENCE_STORAGE_KEY}:${authState.userId}`;
  }

  if (authState.status === "dev") {
    return DEV_WINE_PREFERENCE_STORAGE_KEY;
  }

  return null;
}

function normalizeWinePreference(value: unknown): WinePreference {
  const profile = typeof value === "object" && value !== null
    ? value as WinePreference
    : {};

  return {
    preferredTypes: uniqueValues(stringArray(profile.preferredTypes)),
    taste: uniqueValues(stringArray(profile.taste)),
    structure: uniqueValues(stringArray(profile.structure)),
    favoriteGrapes: uniqueValues(stringArray(profile.favoriteGrapes)),
    excludedStyles: uniqueValues(stringArray(profile.excludedStyles))
  };
}

function stringArray(values: unknown) {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function uniqueValues(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    return result.some((item) => normalizeWinePreferenceValue(item) === normalizeWinePreferenceValue(value))
      ? result
      : [...result, value.trim()];
  }, []);
}

function normalizeWinePreferenceValue(value: string) {
  return value.trim().normalize("NFC").toLowerCase();
}
