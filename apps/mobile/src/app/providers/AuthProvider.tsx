import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { deleteAccount as deleteAccountRequest } from "../../api/pickformeApi";
import { env } from "../../config/env";
import { getMobileContent } from "../../content/mobileContent";
import { supabase } from "../../services/supabaseClient";
import type { AuthState } from "../../types/auth";

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const authContent = getMobileContent(undefined).authErrors;
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    if (env.devMode) {
      setState({ status: "anonymous" });
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setState(authStateFromSession(data.session));
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setState(authStateFromSession(session));
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const normalized = email.trim().toLowerCase();

    if (env.devMode) {
      if (!env.devEmail) {
        throw new Error(authContent.devNotConfigured);
      }

      if (normalized !== env.devEmail) {
        throw new Error(authContent.devNotAllowed);
      }

      setState({ status: "dev", email: normalized });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password
    });

    if (error) {
      throw new Error(authContent.loginFailed);
    }

    setState(authStateFromSession(data.session));
  }

  async function signOut() {
    if (!env.devMode) {
      await supabase.auth.signOut();
    }

    setState({ status: "anonymous" });
  }

  async function deleteAccount() {
    if (env.devMode) {
      throw new Error(authContent.accountDeleteDevUnavailable);
    }

    try {
      await deleteAccountRequest();
    } catch {
      throw new Error(authContent.accountDeleteFailed);
    }

    try {
      await supabase.auth.signOut();
    } finally {
      setState({ status: "anonymous" });
    }
  }

  const value = useMemo(
    () => ({
      state,
      signIn,
      signOut,
      deleteAccount
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error(authContent.missingProvider);
  }

  return value;
}

function authStateFromSession(session: Session | null): AuthState {
  if (!session?.user) {
    return { status: "anonymous" };
  }

  return {
    status: "authenticated",
    userId: session.user.id,
    email: session.user.email || undefined
  };
}
