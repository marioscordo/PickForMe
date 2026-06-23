import React, { createContext, useContext, useMemo, useState } from "react";
import { env } from "../../config/env";
import type { AuthState } from "../../types/auth";

type AuthContextValue = {
  state: AuthState;
  loginDev: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "anonymous" });

  async function loginDev(email: string) {
    const normalized = email.trim().toLowerCase();

    if (!env.devMode) {
      throw new Error("Dev-Login ist deaktiviert.");
    }

    if (normalized !== env.devEmail) {
      throw new Error("Diese lokale V1 ist aktuell nur für Mario freigeschaltet.");
    }

    setState({ status: "dev", email: normalized });
  }

  async function signOut() {
    setState({ status: "anonymous" });
  }

  const value = useMemo(
    () => ({
      state,
      loginDev,
      signOut
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth muss innerhalb von AuthProvider genutzt werden.");
  }

  return value;
}
