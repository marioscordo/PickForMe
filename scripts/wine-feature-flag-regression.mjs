import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const mobileFeatures = read("apps/mobile/src/config/profileFeatures.ts");
const apiFeatures = read("apps/api/src/config/profileFeatures.ts");
const pickScreen = read("apps/mobile/src/screens/pick/PickScreen.tsx");
const profileScreen = read("apps/mobile/src/screens/profile/ProfileScreen.tsx");
const recommendationCard = read("apps/mobile/src/components/pick/RecommendationCard.tsx");
const wineRoute = read("apps/api/app/api/wine-recommendation/route.ts");
const wineMenuRoute = read("apps/api/app/api/wine-menu-recommendation/route.ts");

assert(mobileFeatures.includes("EXPO_PUBLIC_GUSTARO_WINE_FEATURE_ENABLED"), "Mobile wine feature flag must be controlled by an Expo public env switch");
assert(mobileFeatures.includes("wineFeatureEnabled"), "Mobile profileFeatures must expose wineFeatureEnabled");
assert(apiFeatures.includes("GUSTARO_WINE_FEATURE_ENABLED"), "API wine feature flag must be controlled by a server env switch");
assert(apiFeatures.includes("wineFeatureEnabled"), "API profileFeatures must expose wineFeatureEnabled");

assert(
  pickScreen.includes("showWineRecommendationAction={profileFeatures.wineFeatureEnabled}"),
  "PickScreen must hide the wine recommendation action when the wine feature is disabled"
);

assert(
  profileScreen.includes('if (!wineFeatureEnabled && activeSection === "wine")'),
  "ProfileScreen must close the wine section when the wine feature is disabled"
);
assert(
  profileScreen.includes("{wineFeatureEnabled ? (") &&
    profileScreen.includes("content.profileScreen.winePreferenceButton"),
  "ProfileScreen must render the wine preference row only behind the wine feature flag"
);
assert(
  profileScreen.includes("isLast={!wineFeatureEnabled}"),
  "ProfileScreen must keep the standard profile list layout clean when wine is disabled"
);

assert(
  recommendationCard.includes("const activeWinePreference = wineFeatureEnabled ? winePreference : null"),
  "RecommendationCard must neutralize winePreference for standard state reset when wine is disabled"
);
assert(
  recommendationCard.includes("...(activeWinePreference ? { winePreference: activeWinePreference } : {})"),
  "RecommendationCard fingerprint must not depend on winePreference when wine is disabled"
);
assert(
  recommendationCard.includes("showWineRecommendationAction && wineFeatureEnabled && !isUncertainReview"),
  "RecommendationCard must not render the wine action when wine is disabled"
);

for (const [name, route] of [
  ["wine-recommendation", wineRoute],
  ["wine-menu-recommendation", wineMenuRoute]
]) {
  assert(route.includes("profileFeatures.wineFeatureEnabled"), `${name} route must check the wine feature flag`);
  assert(route.includes('new AppError(403, "FEATURE_DISABLED"'), `${name} route must reject disabled wine access with FEATURE_DISABLED`);
}

console.log("wine feature flag regression passed");
