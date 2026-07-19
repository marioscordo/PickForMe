import { Linking } from "react-native";
import { env } from "../config/env";
import { supabase } from "./supabaseClient";

type AuthCallbackSource = "initial" | "event";

type AuthCallbackResult =
  | { status: "none"; source: AuthCallbackSource }
  | { status: "rejected"; reason: "invalid_url" | "unsupported_url"; source: AuthCallbackSource }
  | { status: "missing_code"; source: AuthCallbackSource }
  | { status: "duplicate"; source: AuthCallbackSource }
  | { status: "processed"; source: AuthCallbackSource; callbackType?: string }
  | { status: "failed"; reason: "exchange_failed"; source: AuthCallbackSource };

type ParsedAuthCallback =
  | { ok: true; code: string; callbackType?: string; fingerprint: string }
  | { ok: false; reason: "invalid_url" | "unsupported_url" | "missing_code" };

type AuthCallbackHandlers = {
  onStart?: () => void;
  onResult?: (result: AuthCallbackResult) => void;
};

const AUTH_CALLBACK_HOST = "auth";
const AUTH_CALLBACK_PATH = "/callback";

const processedCallbackFingerprints = new Set<string>();
const processingCallbackFingerprints = new Set<string>();

export function getAuthCallbackUrl() {
  return `${getAuthCallbackScheme()}://${AUTH_CALLBACK_HOST}${AUTH_CALLBACK_PATH}`;
}

export async function processInitialAuthCallback(handlers: AuthCallbackHandlers = {}) {
  const initialUrl = await Linking.getInitialURL();

  return processAuthCallbackUrl(initialUrl, "initial", handlers);
}

export function subscribeToAuthCallbacks(handlers: AuthCallbackHandlers = {}) {
  const subscription = Linking.addEventListener("url", ({ url }) => {
    void processAuthCallbackUrl(url, "event", handlers);
  });

  return () => {
    subscription.remove();
  };
}

export async function processAuthCallbackUrl(
  url: string | null,
  source: AuthCallbackSource,
  handlers: AuthCallbackHandlers = {}
): Promise<AuthCallbackResult> {
  if (!url) {
    return notifyResult({ status: "none", source }, handlers);
  }

  const parsed = parseAuthCallbackUrl(url);

  if (!parsed.ok) {
    return notifyResult(
      parsed.reason === "missing_code"
        ? { status: "missing_code", source }
        : { status: "rejected", reason: parsed.reason, source },
      handlers
    );
  }

  if (
    processedCallbackFingerprints.has(parsed.fingerprint) ||
    processingCallbackFingerprints.has(parsed.fingerprint)
  ) {
    return notifyResult({ status: "duplicate", source }, handlers);
  }

  processingCallbackFingerprints.add(parsed.fingerprint);
  handlers.onStart?.();

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);

    if (error) {
      return notifyResult({ status: "failed", reason: "exchange_failed", source }, handlers);
    }

    processedCallbackFingerprints.add(parsed.fingerprint);

    return notifyResult(
      { status: "processed", source, ...(parsed.callbackType ? { callbackType: parsed.callbackType } : {}) },
      handlers
    );
  } catch {
    return notifyResult({ status: "failed", reason: "exchange_failed", source }, handlers);
  } finally {
    processingCallbackFingerprints.delete(parsed.fingerprint);
  }
}

function parseAuthCallbackUrl(value: string): ParsedAuthCallback {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (
    url.protocol !== `${getAuthCallbackScheme()}:` ||
    url.hostname !== AUTH_CALLBACK_HOST ||
    url.pathname !== AUTH_CALLBACK_PATH
  ) {
    return { ok: false, reason: "unsupported_url" };
  }

  const code = url.searchParams.get("code")?.trim();

  if (!code) {
    return { ok: false, reason: "missing_code" };
  }

  const callbackType = url.searchParams.get("type")?.trim() || undefined;

  return {
    ok: true,
    code,
    ...(callbackType ? { callbackType } : {}),
    fingerprint: createCallbackFingerprint(url, code)
  };
}

function getAuthCallbackScheme() {
  return env.devMode ? "gustaroai-dev" : "gustaroai";
}

function createCallbackFingerprint(url: URL, code: string) {
  return hashCallbackValue(`${url.protocol}//${url.hostname}${url.pathname}?code=${code}`);
}

function hashCallbackValue(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return hash.toString(36);
}

function notifyResult(result: AuthCallbackResult, handlers: AuthCallbackHandlers) {
  handlers.onResult?.(result);

  return result;
}
