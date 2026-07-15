import { useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "../app/providers/ProfileProvider";
import { PickForMeApiError } from "../api/apiClient";
import { analyzeMenu, type MenuImageSource } from "../api/pickformeApi";
import { useMobileContent } from "../content/useMobileContent";
import type { MobileContent } from "../content/mobileContent";
import type { RequestedDishRole } from "../types/recommendationMode";
import type { AnalyzeData } from "../types/recommendations";

export const MOBILE_ANALYZE_TIMEOUT_MS = 105000;

export type AnalyzeMenuErrorPresentation = {
  code?: string;
  httpStatus?: number;
  message: string;
  title: string;
};

export function getAnalyzeMenuErrorPresentation(error: unknown, content: MobileContent): AnalyzeMenuErrorPresentation {
  if (!(error instanceof PickForMeApiError)) {
    if (error instanceof Error && error.message.includes("nicht eingeloggt")) {
      return {
        message: content.analysisErrors.auth,
        title: content.pick.connectionErrorTitle
      };
    }

    if (error instanceof TypeError) {
      return {
        message: content.analysisErrors.apiConnection,
        title: content.pick.connectionErrorTitle
      };
    }

    if (isAbortError(error) || isClientAnalyzeTimeoutError(error)) {
      return {
        code: "CLIENT_ANALYZE_TIMEOUT",
        message: content.analysisErrors.analysisTimeout,
        title: content.pick.analysisTimeoutTitle
      };
    }

    return {
      message: content.analysisErrors.generic,
      title: content.pick.technicalErrorTitle
    };
  }

  const base = {
    code: error.code,
    httpStatus: error.status
  };

  switch (error.code) {
    case "ANALYSIS_TIMEOUT":
      return {
        ...base,
        message: content.analysisErrors.analysisTimeout,
        title: content.pick.analysisTimeoutTitle
      };

    case "AUTH_REQUIRED":
    case "SESSION_INVALID":
      return {
        ...base,
        message: content.analysisErrors.auth,
        title: content.pick.connectionErrorTitle
      };

    case "DEV_AUTH_DISABLED":
    case "DEV_USER_NOT_ALLOWED":
      return {
        ...base,
        message: content.analysisErrors.devAuth,
        title: content.pick.connectionErrorTitle
      };

    case "CONNECTION_ERROR":
      return {
        ...base,
        message: content.analysisErrors.apiConnection,
        title: content.pick.connectionErrorTitle
      };

    case "DYNAMIC_MENU_UNSUPPORTED":
      return {
        ...base,
        message: content.analysisErrors.dynamicMenuUnsupported,
        title: content.pick.technicalErrorTitle
      };

    case "MENU_URL_LOAD_FAILED":
      return {
        ...base,
        message: content.analysisErrors.menuUrlLoadFailed,
        title: content.pick.technicalErrorTitle
      };

    case "AI_RATE_LIMIT":
      return {
        ...base,
        message: content.analysisErrors.aiRateLimit,
        title: content.pick.technicalErrorTitle
      };

    case "MENU_TOO_SHORT":
      return {
        ...base,
        message: content.analysisErrors.menuTooShort,
        title: content.pick.inputMissingTitle
      };

    case "SOURCE_KIND_UNSUPPORTED":
      return {
        ...base,
        message: content.analysisErrors.sourceKindUnsupported,
        title: content.pick.technicalErrorTitle
      };

    case "PDF_AI_DISABLED":
      return {
        ...base,
        message: content.analysisErrors.pdfAiDisabled,
        title: content.pick.technicalErrorTitle
      };

    case "NO_DISHES_FOUND":
      return {
        ...base,
        message: content.analysisErrors.noDishesFound,
        title: content.pick.technicalErrorTitle
      };

    case "NO_SAFE_RECOMMENDATIONS":
      return {
        ...base,
        message: content.analysisErrors.unsafeProfile,
        title: content.pick.errorTitle
      };

    case "ANALYSIS_NOT_SAFE":
      return {
        ...base,
        message: content.analysisErrors.analysisNotSafe,
        title: content.pick.errorTitle
      };

    default:
      if (error.message.includes("Profilregeln")) {
        return {
          ...base,
          message: content.analysisErrors.unsafeProfile,
          title: content.pick.errorTitle
        };
      }

      if (error.status && error.status >= 500) {
        return {
          ...base,
          message: content.analysisErrors.generic,
          title: content.pick.technicalErrorTitle
        };
      }

      return {
        ...base,
        message: content.analysisErrors.generic,
        title: content.pick.technicalErrorTitle
      };
  }
}

export function getAnalyzeMenuErrorMessage(error: unknown, content: MobileContent): string {
  return getAnalyzeMenuErrorPresentation(error, content).message;
}

export function useAnalyzeMenu() {
  const { profile } = useProfile();
  const content = useMobileContent();
  const [result, setResult] = useState<AnalyzeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorTitle, setErrorTitle] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [errorHttpStatus, setErrorHttpStatus] = useState<number | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<number | null>(null);
  const [lastResponseReceivedAt, setLastResponseReceivedAt] = useState<number | null>(null);
  const [lastDiagnosticRunId, setLastDiagnosticRunId] = useState("");
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const profileFingerprint = useMemo(
    () =>
      JSON.stringify({
        outputLocale: profile.outputLocale,
        primaryLikes: profile.primaryLikes,
        customExclusions: profile.customExclusions,
        allergens: profile.allergens
      }),
    [profile]
  );

  useEffect(() => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResult(null);
    setError("");
    setErrorTitle("");
    setErrorCode("");
    setErrorHttpStatus(null);
    setLoading(false);
    setCurrentRequestId(null);
    setLastResponseReceivedAt(null);
    setLastDiagnosticRunId("");
  }, [profileFingerprint]);

  async function run(
    menuText: string,
    requestedDishRoles: RequestedDishRole[],
    menuUrls?: string[],
    diagnostics?: { linkConfirmedAt?: number; menuImageSource?: MenuImageSource | null }
  ) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setCurrentRequestId(requestId);
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setError("");
    setErrorTitle("");
    setErrorCode("");
    setErrorHttpStatus(null);
    setResult(null);

    const trimmedMenuText = menuText.trim();
    const hasImageSource = Boolean(diagnostics?.menuImageSource?.imageBase64?.trim());

    if (trimmedMenuText.length === 0 && !hasImageSource) {
      setError(content.analysisErrors.emptyMenuInput);
      setErrorTitle(content.pick.inputMissingTitle);
      setCurrentRequestId(null);
      return;
    }

    if (trimmedMenuText.length < 20 && !hasImageSource) {
      setError(content.analysisErrors.menuTooShort);
      setErrorTitle(content.pick.inputMissingTitle);
      setCurrentRequestId(null);
      return;
    }

    const profileForRequest = JSON.parse(JSON.stringify(profile));

    setLoading(true);
    const diagnosticRunId = createMobileAnalyzeRunId();
    const requestStartedAt = Date.now();
    let clientTimeoutElapsed = false;
    let responseHttpStatus: number | undefined;
    const timeoutTimer = setTimeout(() => {
      clientTimeoutElapsed = true;
      abortController.abort();
    }, MOBILE_ANALYZE_TIMEOUT_MS);

    try {
      logDevAnalyzeTiming({
        runId: diagnosticRunId,
        phase: "request_start",
        requestId,
        clientTimeoutMs: MOBILE_ANALYZE_TIMEOUT_MS,
        success: true
      });
      logDevAnalyzeTiming({
        runId: diagnosticRunId,
        phase: "mobile.link_confirmed_to_request_start",
        durationMs: diagnostics?.linkConfirmedAt ? requestStartedAt - diagnostics.linkConfirmedAt : 0,
        success: true
      });
      const data = await analyzeMenu({
        menuText,
        menuUrls,
        menuImageSource: diagnostics?.menuImageSource,
        onResponseStatus: (status) => {
          responseHttpStatus = status;
        },
        requestedDishRoles,
        profile: profileForRequest,
        diagnosticRunId,
        signal: abortController.signal
      });
      const responseReceivedAt = Date.now();
      logDevAnalyzeTiming({
        runId: diagnosticRunId,
        phase: "response_received",
        requestId,
        durationMs: responseReceivedAt - requestStartedAt,
        httpStatus: responseHttpStatus,
        success: true
      });
      logDevAnalyzeTiming({
        runId: diagnosticRunId,
        phase: "mobile.request_duration",
        durationMs: responseReceivedAt - requestStartedAt,
        success: true
      });

      if (requestIdRef.current !== requestId) {
        logMobileRecommendationDiag({
          mobileRequestId: requestId,
          serverRunId: diagnosticRunId,
          recommendationCount: data.recommendations.length,
          ...countRecommendationDescriptions(data),
          resultAccepted: false,
          staleReason: "request_replaced"
        });
        return;
      }

      logMobileRecommendationDiag({
        mobileRequestId: requestId,
        serverRunId: diagnosticRunId,
        recommendationCount: data.recommendations.length,
        ...countRecommendationDescriptions(data),
        resultAccepted: true
      });
      setError("");
      setErrorTitle("");
      setErrorCode("");
      setErrorHttpStatus(null);
      setLastDiagnosticRunId(diagnosticRunId);
      setLastResponseReceivedAt(responseReceivedAt);
      setResult(data);
    } catch (e) {
      const presentation: AnalyzeMenuErrorPresentation = clientTimeoutElapsed
        ? {
          code: "CLIENT_ANALYZE_TIMEOUT",
          message: content.analysisErrors.analysisTimeout,
          title: content.pick.analysisTimeoutTitle
        }
        : getAnalyzeMenuErrorPresentation(e, content);
      logDevAnalyzeTiming({
        runId: diagnosticRunId,
        phase: "mobile.request_duration",
        durationMs: Date.now() - requestStartedAt,
        success: false,
        errorClass: e instanceof Error ? e.name : typeof e
      });
      if (requestIdRef.current !== requestId) {
        return;
      }

      if (isAbortError(e)) {
        logDevAnalyzeTiming({
          runId: diagnosticRunId,
          phase: "request_aborted",
          requestId,
          durationMs: Date.now() - requestStartedAt,
          abortReason: clientTimeoutElapsed ? "client_timeout" : "abort",
          appState: "active",
          clientTimeoutMs: MOBILE_ANALYZE_TIMEOUT_MS
        });
        setError(presentation.message);
        setErrorTitle(presentation.title);
        setErrorCode(presentation.code ?? "");
        setErrorHttpStatus(presentation.httpStatus ?? null);
        return;
      }

      logDevAnalyzeTiming({
        runId: diagnosticRunId,
        phase: "error_mapped",
        requestId,
        mappedErrorCode: presentation.code,
        httpStatus: presentation.httpStatus
      });
      setError(presentation.message);
      setErrorTitle(presentation.title);
      setErrorCode(presentation.code ?? "");
      setErrorHttpStatus(presentation.httpStatus ?? null);
    } finally {
      clearTimeout(timeoutTimer);
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
    setErrorTitle("");
    setErrorCode("");
    setErrorHttpStatus(null);
    setResult(null);
    setLoading(false);
    setCurrentRequestId(null);
    setLastResponseReceivedAt(null);
    setLastDiagnosticRunId("");
  }

  return {
    result,
    loading,
    error,
    errorTitle,
    errorCode,
    errorHttpStatus,
    currentRequestId,
    lastResponseReceivedAt,
    lastDiagnosticRunId,
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

function isClientAnalyzeTimeoutError(error: unknown) {
  return error instanceof Error && error.message === "CLIENT_ANALYZE_TIMEOUT";
}

function createMobileAnalyzeRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function logDevAnalyzeTiming(fields: Record<string, string | number | boolean | undefined | null>) {
  if (!__DEV__) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_DEV_ANALYZE_TIMING] ${payload}`);
}

function countRecommendationDescriptions(data: AnalyzeData) {
  const dishesById = new Map(data.dishes.map((dish) => [dish.id, dish]));
  let translatedDescriptionCount = 0;
  let originalDescriptionCount = 0;

  for (const recommendation of data.recommendations) {
    const dish = dishesById.get(recommendation.dishId);

    if (recommendation.translatedDescription?.trim() || dish?.description?.trim()) {
      translatedDescriptionCount += 1;
    }

    if (recommendation.descriptionOriginal?.trim() || dish?.descriptionOriginal?.trim()) {
      originalDescriptionCount += 1;
    }
  }

  return {
    originalDescriptionCount,
    translatedDescriptionCount
  };
}

function logMobileRecommendationDiag(fields: Record<string, string | number | boolean | undefined | null>) {
  if (!__DEV__) {
    return;
  }

  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");

  console.info(`[GUSTARO_MOBILE_RECOMMENDATION_DIAG] ${payload}`);
}
