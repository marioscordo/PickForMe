import { useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "../app/providers/ProfileProvider";
import { PickForMeApiError } from "../api/apiClient";
import { analyzeMenu } from "../api/pickformeApi";
import { useMobileContent } from "../content/useMobileContent";
import type { MobileContent } from "../content/mobileContent";
import type { Situation } from "../types/profile";
import type { AnalyzeData } from "../types/recommendations";

function getAnalyzeMenuErrorMessage(error: unknown, content: MobileContent): string {
  if (!(error instanceof PickForMeApiError)) {
    if (error instanceof Error && error.message.includes("nicht eingeloggt")) {
      return content.analysisErrors.auth;
    }

    if (error instanceof TypeError) {
      return content.analysisErrors.apiConnection;
    }

    return content.analysisErrors.generic;
  }

  switch (error.code) {
    case "AUTH_REQUIRED":
    case "SESSION_INVALID":
      return content.analysisErrors.auth;

    case "DEV_AUTH_DISABLED":
    case "DEV_USER_NOT_ALLOWED":
      return content.analysisErrors.devAuth;

    case "DYNAMIC_MENU_UNSUPPORTED":
      return content.analysisErrors.dynamicMenuUnsupported;

    case "MENU_URL_LOAD_FAILED":
      return content.analysisErrors.menuUrlLoadFailed;

    case "AI_RATE_LIMIT":
      return content.analysisErrors.aiRateLimit;

    case "MENU_TOO_SHORT":
      return content.analysisErrors.menuTooShort;

    case "SOURCE_KIND_UNSUPPORTED":
      return content.analysisErrors.sourceKindUnsupported;

    case "PDF_AI_DISABLED":
      return content.analysisErrors.pdfAiDisabled;

    case "NO_DISHES_FOUND":
      return content.analysisErrors.noDishesFound;

    case "NO_SAFE_RECOMMENDATIONS":
      return content.analysisErrors.unsafeProfile;

    case "ANALYSIS_NOT_SAFE":
      return error.message || content.analysisErrors.generic;

    default:
      if (error.message.includes("Profilregeln")) {
        return content.analysisErrors.unsafeProfile;
      }

      return content.analysisErrors.generic;
  }
}

export function useAnalyzeMenu() {
  const { profile } = useProfile();
  const content = useMobileContent();
  const [result, setResult] = useState<AnalyzeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const profileFingerprint = useMemo(
    () =>
      JSON.stringify({
        dietStyle: profile.dietStyle,
        outputLocale: profile.outputLocale,
        primaryLikes: profile.primaryLikes,
        secondaryLikes: profile.secondaryLikes,
        dislikes: profile.dislikes,
        intolerances: profile.intolerances,
        customPreferences: profile.customPreferences,
        customExclusions: profile.customExclusions,
        customIntolerances: profile.customIntolerances,
        allergens: profile.allergens,
        hiddenPreferences: profile.hiddenPreferences,
        hiddenExclusions: profile.hiddenExclusions,
        hiddenIntolerances: profile.hiddenIntolerances,
        hiddenAllergens: profile.hiddenAllergens
      }),
    [profile]
  );

  useEffect(() => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResult(null);
    setError("");
    setLoading(false);
  }, [profileFingerprint]);

  async function run(menuText: string, situation: Situation, menuUrls?: string[]) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setError("");
    setResult(null);

    const trimmedMenuText = menuText.trim();

    if (trimmedMenuText.length === 0) {
      setError(content.analysisErrors.emptyMenuInput);
      return;
    }

    if (trimmedMenuText.length < 20) {
      setError(content.analysisErrors.menuTooShort);
      return;
    }

    const profileForRequest = JSON.parse(JSON.stringify(profile));

    setLoading(true);

    try {
      const data = await analyzeMenu({
        menuText,
        menuUrls,
        situation,
        profile: {
          ...profileForRequest,
          appetiteMood: situation
        },
        signal: abortController.signal
      });

      if (requestIdRef.current !== requestId) {
        return;
      }

      setResult(data);
    } catch (e) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      if (isAbortError(e)) {
        return;
      }

      setError(getAnalyzeMenuErrorMessage(e, content));
    } finally {
      if (requestIdRef.current === requestId) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  function reset() {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setError("");
    setResult(null);
    setLoading(false);
  }

  return {
    result,
    loading,
    error,
    run,
    reset
  };
}

function isAbortError(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError";
}
