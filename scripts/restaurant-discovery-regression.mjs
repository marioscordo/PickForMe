import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
const menuInput = read("apps/mobile/src/components/pick/MenuInputCard.tsx");
const dialog = read("apps/mobile/src/components/pick/RestaurantDiscoveryDialog.tsx");
const routine = read("apps/mobile/src/gustaroai/restaurantDiscoveryRoutine.ts");
const mobileApi = read("apps/mobile/src/api/pickformeApi.ts");
const backendRoute = read("apps/api/app/api/restaurant-discovery/route.ts");
const backendService = read("apps/api/src/restaurant/discoverRestaurantSource.ts");
const menuParser = read("apps/api/src/menu/parseMenu.ts");
const textAiFacts = read("apps/api/src/ai/extractMenuFactsFromTextAI.ts");
const analyzeRoute = read("apps/api/app/api/analyze-menu/route.ts");
const content = JSON.parse(read("apps/mobile/src/content/mobileContent.de-DE.json"));

function extractStyleNumber(source, styleName, propertyName) {
  const styleMatch = new RegExp(`${styleName}:\\s*{([\\s\\S]*?)\\n\\s*}`, "m").exec(source);
  if (!styleMatch) return null;

  const propertyMatch = new RegExp(`${propertyName}:\\s*(\\d+)`).exec(styleMatch[1]);
  return propertyMatch ? Number(propertyMatch[1]) : null;
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) return "";

  const openBrace = source.indexOf("{", start);
  if (openBrace < 0) return "";

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace + 1, index);
      }
    }
  }

  return "";
}

const baseInputHeight = extractStyleNumber(menuInput, "textArea", "height");
const compactInputHeight = extractStyleNumber(menuInput, "textAreaCompact", "height");
const compactInputMaxHeight = extractStyleNumber(menuInput, "textAreaCompact", "maxHeight");
const closeRestaurantDiscoveryBody = extractFunctionBody(pickScreen, "closeRestaurantDiscovery");
const applyDiscoveredMenuUrlBody = extractFunctionBody(pickScreen, "applyDiscoveredMenuUrl");

assert(content.pick.findMenuButton === "Speisekarte finden", "Button text missing");
assert(pickScreen.includes("content.pick.findMenuButton"), "PickScreen does not render discovery button");
assert(pickScreen.includes("<MenuInputCard menuText={menuText} setMenuText={setMenuText} compact />"), "Menu input is not compacted");
assert(menuInput.includes("textAreaCompact"), "Compact input style missing");
assert(baseInputHeight && compactInputHeight, "Menu input heights missing");
assert(compactInputHeight < baseInputHeight, "Compact input height is not smaller than default input height");
assert(compactInputMaxHeight === compactInputHeight, "Compact input maxHeight must match compact height");
assert(dialog.includes("generateRestaurantCandidates") && dialog.includes("showCandidates"), "Candidate search binding missing");
assert(dialog.includes("gustaroaiRestaurantDiscoveryProvider"), "Dialog does not use GustaroAI backend discovery provider");
assert(mobileApi.includes('"/api/restaurant-discovery"'), "Mobile API does not call restaurant discovery backend");
assert(backendRoute.includes("requireUser(request)"), "Restaurant discovery backend route is not auth-gated");
assert(backendService.includes("web_search_preview"), "Backend discovery does not use web search provider");
assert(backendService.includes("buildMenuRecoveryPrompt") && backendService.includes("hasAnalyzableMenuCandidate"), "Backend discovery does not run menu-focused recovery when first-pass candidates have no analyzable menu");
assert(backendService.includes("buildLikelyOfficialWebsiteCandidates") && backendService.includes("addVerifiedMenuCandidate"), "Backend discovery does not probe likely official domains only as verified menu candidates");
assert(backendService.includes("getRegistrableDomain") && backendService.includes("verifyReachableUrl"), "Backend discovery URL guards missing");
assert(backendService.includes("loadMenuTextFromUrl") && backendService.includes("verifyAnalyzableMenuUrl"), "Backend discovery does not preflight menu URLs with the shared loader");
assert(backendService.includes("parseMenu(menuText)") && backendService.includes("isAnalyzableMenuText"), "Backend discovery does not validate menu text analyzability");
assert(backendService.includes("findSameDomainAnalyzableMenuUrl"), "Backend discovery crawler does not require analyzable menu URLs");
assert(backendService.includes("findLinkedAnalyzableMenuUrl") && backendService.includes("verifyDirectAnalyzableMenuUrl"), "Backend discovery does not resolve menu landing pages to directly analyzable menu files");
assert(backendService.includes("return parseMenu(menuText).length >= 2"), "Backend discovery must fail closed when shared parser finds fewer than two menu entries");
assert(backendService.includes("buildLikelyMenuUrls") && backendService.includes("/menu/"), "Backend discovery crawler does not probe likely menu paths");
assert(menuParser.includes('itemType: isDrink ? "drink" : "dish"') && menuParser.includes('dishRole: isDrink ? "drink" : undefined'), "Menu parser does not classify recognized drinks as drink items");
assert(textAiFacts.includes("Getraenke duerfen niemals itemType dish bekommen"), "Text AI extraction prompt does not protect dish classification from drinks");
assert(textAiFacts.includes("coerceMenuItemType") && textAiFacts.includes('itemType: "drink"'), "Text AI facts validation does not correct obvious drink items away from dish");
assert(analyzeRoute.includes("askPickForMePdfUrlAI"), "Analyze route does not use the direct PDF AI path");
assert(analyzeRoute.includes('mode: "ai_pdf"'), "Analyze route does not return direct PDF AI results");
assert(analyzeRoute.includes("SAFE_ANALYSIS_NOT_POSSIBLE_MESSAGE"), "Analyze route does not have a safe closed-failure message");
assert(analyzeRoute.includes("TEXT_AI_TIMEOUT_MS"), "Analyze route does not define a governed text AI timeout");
assert(analyzeRoute.includes("PDF_AI_TIMEOUT_MS"), "Analyze route does not define a governed PDF AI timeout");
assert(analyzeRoute.includes('message.includes("TEXT_AI_TIMEOUT")') && !analyzeRoute.includes("falling back to local recommendation"), "Analyze route must not silently fall back to local recommendations after AI timeout");
assert(analyzeRoute.includes("parsedMenuItems.filter(isFoodDish)") && analyzeRoute.includes('dish.itemType !== "drink"'), "Analyze route does not keep drink items out of food recommendations");
assert(analyzeRoute.includes('throw new AppError(400, "PDF_AI_DISABLED"'), "Analyze route must fail closed for PDF links when AI is disabled");
assert(dialog.includes("DOUBLE_TAP_WINDOW_MS") && dialog.includes("setSelectedCandidate(candidate)"), "Double-tap selection missing");
assert(dialog.includes("disabled={loadingMenu || !selectedCandidate}"), "Menu button is not gated by selected restaurant");
assert(content.restaurantDiscovery.noMenuUrl === "Kein auswertbarer Speisekartenlink gefunden. Bitte Link, Text oder Foto manuell einfügen", "Exact no-menu-url message changed");
assert(dialog.includes("const nextMenuUrl = menuUrl") && dialog.includes("onApply(nextMenuUrl)"), "Apply does not preserve and return the menu URL");
assert(dialog.includes("resetDialogState()") && dialog.includes("sessionIdRef.current += 1"), "Dialog state reset/session invalidation missing");
assert(dialog.includes("onRequestClose={closeDialog}") && dialog.includes("onPress={closeDialog}") && content.restaurantDiscovery.backButton === "zur\u00fcck", "Back flow reset missing");
assert(pickScreen.includes("function resetAnalysisState()") && pickScreen.includes("setLastAnalyzedMenuUrl(\"\")"), "Explicit analysis reset function missing");
assert(closeRestaurantDiscoveryBody && !closeRestaurantDiscoveryBody.includes("resetAnalysisState"), "Closing discovery must preserve existing analysis state");
assert(applyDiscoveredMenuUrlBody && !applyDiscoveredMenuUrlBody.includes("resetAnalysisState"), "Applying discovered menu URL must preserve existing analysis state until a new analysis starts");
assert(routine.includes("gustaroai-api"), "GustaroAI backend provider missing");
assert(routine.includes("const result = await discoverRestaurantMenu(candidate)") && routine.includes("return result.menuUrl ? [{ url: result.menuUrl, kind: \"menu\" }] : []"), "GustaroAI backend provider must use backend menu discovery instead of local crawling");
assert(routine.includes("getRegistrableDomain(menuUrl) !== websiteDomain"), "Same-domain guard missing");
assert(routine.includes("kind !== \"menu\""), "Structured menu kind guard missing");

console.log("Restaurant discovery regression checks passed.");
