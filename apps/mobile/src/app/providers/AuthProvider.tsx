import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { deleteAccount as deleteAccountRequest } from "../../api/pickformeApi";
import { env } from "../../config/env";
import { getMobileContent } from "../../content/mobileContent";
import { resolveGuiLanguageFromDevice } from "../../content/guiLanguage";
import { getAuthCallbackUrl, processInitialAuthCallback, subscribeToAuthCallbacks } from "../../services/authLinkingService";
import { supabase } from "../../services/supabaseClient";
import type { AuthState } from "../../types/auth";

export type SignUpResult =
  | { status: "confirmation-required"; email: string }
  | { status: "authenticated" }
  | { status: "error"; message: string };

// Eigene Fehlerklasse statt Text-Vergleich, damit LoginScreen diesen
// speziellen Fall (Konto existiert, Passwort korrekt, aber E-Mail nie
// bestaetigt) unabhaengig von der GUI-Sprache erkennen und einen
// "erneut senden"-Button anbieten kann - ohne die generische
// "Login fehlgeschlagen"-Meldung dafuer zu missbrauchen.
export class EmailNotConfirmedError extends Error {}

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
};

const authContent = getMobileContent(resolveGuiLanguageFromDevice()).authErrors;
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    if (env.devMode) {
      setState({ status: "anonymous" });
      return;
    }

    let active = true;
    let authRevision = 0;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authRevision += 1;

      if (active) {
        setState(authStateFromSession(session));
      }
    });

    const unsubscribeAuthCallbacks = subscribeToAuthCallbacks({
      onStart: () => {
        if (active) {
          setState({ status: "loading" });
        }
      }
    });

    async function initializeAuth() {
      await processInitialAuthCallback({
        onStart: () => {
          if (active) {
            setState({ status: "loading" });
          }
        }
      });

      const revisionBeforeSessionLoad = authRevision;
      const { data: sessionData } = await supabase.auth.getSession();

      if (active && revisionBeforeSessionLoad === authRevision) {
        setState(authStateFromSession(sessionData.session));
      }
    }

    initializeAuth()
      .catch(() => {
        if (active) {
          setState({ status: "anonymous" });
        }
      });

    return () => {
      active = false;
      unsubscribeAuthCallbacks();
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
      if (error.code === "email_not_confirmed") {
        throw new EmailNotConfirmedError(authContent.emailNotConfirmed);
      }

      throw new Error(authContent.loginFailed);
    }

    setState(authStateFromSession(data.session));
  }

  // Fuer Nutzer, die die urspruengliche Bestaetigungs-Mail nie erhalten haben
  // (Spamfilter, Tippfehler beim Versand o.ae.) - loest denselben
  // Supabase-Versand aus wie signUp(), ohne ein neues Konto anzulegen.
  async function resendConfirmationEmail(email: string) {
    const normalized = email.trim().toLowerCase();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalized,
      options: {
        emailRedirectTo: getAuthCallbackUrl()
      }
    });

    if (error) {
      throw new Error(authContent.resendConfirmationFailed);
    }
  }

  async function signUp(email: string, password: string): Promise<SignUpResult> {
    const normalized = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        emailRedirectTo: getAuthCallbackUrl()
      }
    });

    if (error) {
      return { status: "error", message: authContent.registrationFailed };
    }

    if (data.session) {
      setState(authStateFromSession(data.session));
      return { status: "authenticated" };
    }

    return { status: "confirmation-required", email: normalized };
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
      signUp,
      signOut,
      deleteAccount,
      resendConfirmationEmail
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
