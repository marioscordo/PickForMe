import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeMenu } from "../api/pickformeApi";
import { PickForMeApiError } from "../api/apiClient";
import { useProfile } from "../app/providers/ProfileProvider";
import type { AnalyzeData } from "../types/recommendations";
import type { Situation } from "../types/profile";

const UNSAFE_PROFILE_MESSAGE =
  "Ich konnte diese Speisekarte aufgrund Deines aktuellen Profils nicht sicher auswerten.";

const GENERIC_ANALYSIS_MESSAGE =
  "Ich konnte diese Speisekarte nicht sicher auswerten.";

function getAnalyzeMenuErrorMessage(error: unknown): string {
  if (!(error instanceof PickForMeApiError)) {
    return GENERIC_ANALYSIS_MESSAGE;
  }

  switch (error.code) {
    case "DYNAMIC_MENU_UNSUPPORTED":
      return "Diese digitale Menüplattform wird in V1 noch nicht unterstützt. Bitte nutze eine PDF-Speisekarte oder füge den Speisekartentext ein.";

    case "MENU_URL_LOAD_FAILED":
      return "Diese Speisekarte konnte nicht geladen werden. Bitte prüfe den Link oder nutze eine PDF-Speisekarte.";

    case "AI_RATE_LIMIT":
      return "Ich kann die Speisekarte gerade nicht auswerten. Bitte versuche es gleich noch einmal.";

    case "MENU_TOO_SHORT":
      return "Bitte füge eine Speisekarte ein oder scanne einen QR-Code.";

    case "SOURCE_KIND_UNSUPPORTED":
      return "Diese Art von Speisekarte wird in V1 noch nicht unterstützt.";

    case "PDF_AI_DISABLED":
      return "PDF-Speisekarten benötigen den KI-Modus.";

    case "NO_DISHES_FOUND":
      return "Ich konnte in dieser Eingabe noch keine Gerichte erkennen.";

    case "NO_SAFE_RECOMMENDATIONS":
      return UNSAFE_PROFILE_MESSAGE;

    case "ANALYSIS_NOT_SAFE":
      return GENERIC_ANALYSIS_MESSAGE;

    default:
      if (error.message.includes("Profilregeln")) {
        return UNSAFE_PROFILE_MESSAGE;
      }

      return GENERIC_ANALYSIS_MESSAGE;
  }
}

export function useAnalyzeMenu() {
  const { profile } = useProfile();
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
        exceptions: profile.exceptions,
        customPreferences: profile.customPreferences,
        customExclusions: profile.customExclusions,
        customIntolerances: profile.customIntolerances,
        customExceptions: profile.customExceptions,
        hiddenPreferences: profile.hiddenPreferences,
        hiddenExclusions: profile.hiddenExclusions,
        hiddenIntolerances: profile.hiddenIntolerances,
        hiddenExceptions: profile.hiddenExceptions
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

  async function run(menuText: string, situation: Situation) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setError("");
    setResult(null);

    if (menuText.trim().length < 20) {
      setError("Bitte zuerst eine Speisekarte einfügen.");
      return;
    }

    const profileForRequest = JSON.parse(JSON.stringify(profile));

    setLoading(true);

    try {
      const data = await analyzeMenu({
        menuText,
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

      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }

      setError(getAnalyzeMenuErrorMessage(e));
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
