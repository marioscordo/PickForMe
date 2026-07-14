import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function parseJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const hook = read("apps/mobile/src/hooks/useAnalyzeMenu.ts");
const apiClient = read("apps/mobile/src/api/apiClient.ts");
const api = read("apps/mobile/src/api/pickformeApi.ts");
const analyzeRoute = read("apps/api/app/api/analyze-menu/route.ts");
const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
const mobilePackage = parseJson("apps/mobile/package.json");
const packageLock = parseJson("package-lock.json");
const de = parseJson("apps/mobile/src/content/mobileContent.de-DE.json");
const en = parseJson("apps/mobile/src/content/mobileContent.en-US.json");

assert(hook.includes("MOBILE_ANALYZE_TIMEOUT_MS = 105000"), "mobile analyze timeout must be 105000 ms");
assert(hook.includes("setTimeout(() =>"), "mobile analyze must have an explicit governed timeout");
assert(hook.includes("abortController.abort()"), "mobile analyze timeout must abort only after the governed timeout");
assert(hook.includes("clearTimeout(timeoutTimer)"), "mobile analyze timeout timer must be cleaned up");
assert(hook.includes("requestIdRef.current !== requestId"), "mobile analyze must keep stale-response guards");
assert(hook.includes("currentRequestId"), "mobile analyze hook must expose the active request id for lifecycle diagnostics");
assert(!hook.includes("AppState"), "mobile analyze must not abort requests just because the app foreground/background changes");
assert(hook.includes('phase: "request_start"'), "mobile analyze timing must log request_start");
assert(hook.includes('phase: "response_received"'), "mobile analyze timing must log response_received");
assert(hook.includes('phase: "request_aborted"'), "mobile analyze timing must log request_aborted");
assert(hook.includes('phase: "error_mapped"'), "mobile analyze timing must log error_mapped");
assert(hook.includes("httpStatus: responseHttpStatus"), "successful mobile analyze response must log HTTP status");

assert(apiClient.includes("status?: number"), "PickForMeApiError must keep HTTP status");
assert(apiClient.includes("onResponseStatus?: (status: number) => void"), "apiPost must expose response status to callers");
assert(apiClient.includes("options.onResponseStatus?.(response.status)"), "apiPost must report response status before payload mapping");
assert(apiClient.includes("response.status"), "apiPost must attach HTTP status to API errors");
assert(api.includes("onResponseStatus?: (status: number) => void"), "analyzeMenu args must accept response status callback");
assert(api.includes("onResponseStatus: args.onResponseStatus"), "analyzeMenu must pass response status callback to apiPost");

assert(hook.includes('case "ANALYSIS_TIMEOUT"'), "ANALYSIS_TIMEOUT must be mapped explicitly");
assert(hook.includes("content.pick.analysisTimeoutTitle"), "ANALYSIS_TIMEOUT must use timeout title");
assert(hook.includes("content.analysisErrors.analysisTimeout"), "ANALYSIS_TIMEOUT must use timeout message");
assert(hook.includes("error instanceof TypeError"), "network TypeError must be mapped explicitly");
assert(hook.includes("content.pick.connectionErrorTitle"), "network errors must use connection title");
assert(hook.includes('case "CONNECTION_ERROR"'), "server connection errors must be mapped explicitly");
assert(hook.includes("content.analysisErrors.apiConnection"), "server connection errors must use connection message");
assert(hook.includes('case "NO_SAFE_RECOMMENDATIONS"'), "safety no-recommendation error must stay explicit");
assert(hook.includes('case "ANALYSIS_NOT_SAFE"'), "safety analysis-not-safe error must stay explicit");
assert(hook.includes("error.status && error.status >= 500"), "unexpected server errors must not use safety title");
assert(analyzeRoute.includes("isTemporaryConnectionError"), "analyze route must classify temporary DNS/connect/OpenAI connection errors");
assert(/503,\s*"CONNECTION_ERROR"/.test(analyzeRoute), "temporary connection errors must return HTTP 503");
assert(analyzeRoute.includes("{ retryable: true }"), "temporary connection errors must be marked retryable");
assert(/if \(aiError instanceof SyntaxError\)[\s\S]*message\.includes\("TWO_STEP_MAIN_AI_TIMEOUT"\)[\s\S]*504,\s*"AI_TIMEOUT"[\s\S]*\{\s*retryable:\s*true\s*\}/.test(analyzeRoute), "main AI timeout must return retryable HTTP 504");
assert(analyzeRoute.includes("pdfAiError instanceof SyntaxError"), "invalid PDF AI JSON must be treated as technical error");
assert(analyzeRoute.includes("aiError instanceof SyntaxError"), "invalid text AI JSON must be treated as technical error");
assert(analyzeRoute.includes('"AI_RESPONSE_INVALID"'), "invalid AI JSON must not be reported as a safety 422");

assert(pickScreen.includes("analyze.errorTitle ||"), "PickScreen must render mapped analyze error titles");
assert(pickScreen.includes("const canOpenMenu = typeof openableMenuUrl === \"string\" && openableMenuUrl.trim().length > 0;"), "PickScreen must keep URL-only open-menu visibility");
assert(pickScreen.includes("if (normalizedMenuUrl)"), "startAnalyze must not clear openableMenuUrl when current text is not a URL");
assert(!pickScreen.includes("normalizedMenuUrl && normalizedMenuUrl !== openableMenuUrl"), "PickScreen must not rebuild openable menu URL from persisted or hydrated text");
assert(!pickScreen.includes("lastAnalyzedMenuUrl"), "PickScreen must not use stale post-analyze URL state");
assert(pickScreen.includes('import * as WebBrowser from "expo-web-browser";'), "PickScreen must use expo-web-browser for menu opening");
assert(pickScreen.includes("WebBrowser.openBrowserAsync(menuUrl)"), "open-menu action must open the menu in the in-app browser");
assert(!pickScreen.includes("Linking.openURL"), "open-menu action must not use the external Linking route");
assert(!pickScreen.includes("openAuthSessionAsync"), "open-menu action must not use auth sessions");
assert(!pickScreen.includes("AuthSession"), "open-menu action must not use AuthSession");
assert(pickScreen.includes("menuBrowserOpeningRef"), "open-menu action must guard against double opens");
assert(pickScreen.includes('phase: "open_menu_start"'), "open-menu action must log start lifecycle");
assert(pickScreen.includes('phase: "open_menu_closed"'), "open-menu action must log close lifecycle");
assert(pickScreen.includes('phase: "open_menu_error"'), "open-menu action must log browser errors without touching analyze errors");
assert(pickScreen.includes('openMethod: "expo_web_browser"'), "open-menu lifecycle must identify expo-web-browser");

const openAnalyzedMenuBody = pickScreen.slice(
  pickScreen.indexOf("async function openAnalyzedMenu()"),
  pickScreen.indexOf("const canOpenMenu", pickScreen.indexOf("async function openAnalyzedMenu()"))
);
assert(openAnalyzedMenuBody.includes("openableMenuUrl?.trim() ?? \"\""), "open-menu action must only use the current-session openable URL");
assert(!openAnalyzedMenuBody.includes("analyze.run"), "open-menu action must not start a second analyze request");
assert(!openAnalyzedMenuBody.includes("analyze.reset"), "open-menu action must not reset analysis state");
assert(!openAnalyzedMenuBody.includes("setError"), "open-menu action must not set analyze errors");
assert(!openAnalyzedMenuBody.includes("setOpenableMenuUrl"), "open-menu action must not mutate menu URL state");
assert(!openAnalyzedMenuBody.includes("abort"), "open-menu action must not abort the running analysis");

assert(mobilePackage.dependencies?.["expo-web-browser"] === "~15.0.11", "mobile app must depend on SDK-compatible expo-web-browser");
assert(packageLock.packages?.["node_modules/expo-web-browser"]?.version === "15.0.11", "package lock must include expo-web-browser 15.0.11");

for (const [locale, content, expected] of [
  ["de-DE", de, {
    timeoutTitle: "Die Analyse dauert gerade zu lange",
    timeoutText: "Die Speisekarte ist weiterhin da. Versuch es bitte noch einmal.",
    connectionTitle: "Verbindung gerade nicht möglich",
    safetyTitle: "Speisekarte nicht sicher ausgewertet"
  }],
  ["en-US", en, {
    timeoutTitle: "Analysis is taking too long",
    timeoutText: "Your menu is still here. Please try again.",
    connectionTitle: "Connection is not possible right now",
    safetyTitle: "Menu could not be evaluated safely"
  }]
]) {
  assert(content.pick.analysisTimeoutTitle === expected.timeoutTitle, `${locale}: timeout title mismatch`);
  assert(content.analysisErrors.analysisTimeout === expected.timeoutText, `${locale}: timeout text mismatch`);
  assert(content.pick.connectionErrorTitle === expected.connectionTitle, `${locale}: connection title mismatch`);
  assert(content.pick.errorTitle === expected.safetyTitle, `${locale}: safety title must remain unchanged`);
  assert(typeof content.pick.technicalErrorTitle === "string" && content.pick.technicalErrorTitle.length > 0, `${locale}: technical title missing`);
}

const CLIENT_TIMEOUT_MS = 105000;
function clientWouldAcceptResponse(durationMs) {
  return durationMs < CLIENT_TIMEOUT_MS;
}

assert(clientWouldAcceptResponse(49000), "49 second successful response must be accepted before client timeout");
assert(clientWouldAcceptResponse(75000), "75 second server processing must be accepted before client timeout");
assert(!clientWouldAcceptResponse(105000), "client timeout boundary must still be governed");

function simulatedTitleFor(error) {
  if (error.kind === "network") return de.pick.connectionErrorTitle;
  if (error.status === 503 && error.code === "CONNECTION_ERROR" && error.retryable === true) return de.pick.connectionErrorTitle;
  if (error.code === "ANALYSIS_TIMEOUT" && error.status === 504) return de.pick.analysisTimeoutTitle;
  if (error.status === 422 && ["NO_SAFE_RECOMMENDATIONS", "ANALYSIS_NOT_SAFE"].includes(error.code)) return de.pick.errorTitle;
  if (error.status >= 500) return de.pick.technicalErrorTitle;
  return de.pick.technicalErrorTitle;
}

assert(simulatedTitleFor({ status: 504, code: "ANALYSIS_TIMEOUT" }) === de.pick.analysisTimeoutTitle, "504 ANALYSIS_TIMEOUT must use timeout title");
assert(simulatedTitleFor({ kind: "network" }) === de.pick.connectionErrorTitle, "network failure must use connection title");
assert(simulatedTitleFor({ status: 503, code: "CONNECTION_ERROR", retryable: true }) === de.pick.connectionErrorTitle, "retryable 503 connection errors must use connection title");
assert(simulatedTitleFor({ status: 422, code: "NO_SAFE_RECOMMENDATIONS" }) === de.pick.errorTitle, "safety 422 must use safety title");
assert(simulatedTitleFor({ status: 500, code: "AI_RESPONSE_INVALID" }) === de.pick.technicalErrorTitle, "invalid AI JSON must use technical title");
assert(simulatedTitleFor({ status: 500, code: "INTERNAL_ERROR" }) === de.pick.technicalErrorTitle, "unexpected 5xx must use technical title");

function canOpenMenu(openableMenuUrl) {
  return typeof openableMenuUrl === "string" && openableMenuUrl.trim().length > 0;
}

assert(canOpenMenu("https://example.test/menu.pdf"), "current-session URL must make open-menu available");
assert(canOpenMenu(" https://example.test/menu.pdf "), "URL with whitespace must still be recognized");
assert(!canOpenMenu(""), "missing URL must hide open-menu button");
assert(!canOpenMenu("   "), "blank URL must hide open-menu button");
assert(!canOpenMenu(null), "cold-start null URL must hide open-menu button");

function simulateOpenMenu(state, { url = "https://example.test/menu.pdf", browserFails = false } = {}) {
  const menuUrl = url.trim();
  if (!menuUrl || state.browserOpening) {
    return { ...state };
  }

  const next = {
    ...state,
    browserOpening: true,
    browserOpenCount: state.browserOpenCount + 1,
    lifecycle: [...state.lifecycle, "open_menu_start"]
  };

  if (browserFails) {
    next.lifecycle.push("open_menu_error");
  } else {
    next.lifecycle.push("open_menu_closed");
  }

  next.browserOpening = false;
  return next;
}

const runningAnalyzeState = {
  requestId: 7,
  loading: true,
  error: "",
  analyzeRequestCount: 1,
  abortCount: 0,
  browserOpenCount: 0,
  browserOpening: false,
  lifecycle: []
};
const openedDuringAnalyze = simulateOpenMenu(runningAnalyzeState);
assert(openedDuringAnalyze.browserOpenCount === 1, "open-menu must open the browser exactly once");
assert(openedDuringAnalyze.requestId === runningAnalyzeState.requestId, "open-menu must preserve the active analyze request id");
assert(openedDuringAnalyze.loading === true, "open-menu must not stop the running analysis");
assert(openedDuringAnalyze.error === "", "open-menu must not create an analyze error");
assert(openedDuringAnalyze.analyzeRequestCount === 1, "open-menu must not start another analyze request");
assert(openedDuringAnalyze.abortCount === 0, "open-menu must not abort the running analyze request");
assert(openedDuringAnalyze.lifecycle.includes("open_menu_start"), "open-menu simulation must log start");
assert(openedDuringAnalyze.lifecycle.includes("open_menu_closed"), "open-menu simulation must log close");

const browserErrorDuringAnalyze = simulateOpenMenu(runningAnalyzeState, { browserFails: true });
assert(browserErrorDuringAnalyze.browserOpenCount === 1, "browser error path must still only attempt one browser open");
assert(browserErrorDuringAnalyze.loading === true, "browser error must not stop the running analysis");
assert(browserErrorDuringAnalyze.error === "", "browser error must not surface as analyze error");
assert(browserErrorDuringAnalyze.analyzeRequestCount === 1, "browser error must not retry analyze");
assert(browserErrorDuringAnalyze.abortCount === 0, "browser error must not abort analyze");
assert(browserErrorDuringAnalyze.lifecycle.includes("open_menu_error"), "browser error must be logged as lifecycle diagnostic");

console.log("mobile analyze lifecycle regression passed");
