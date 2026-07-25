const wineFeatureEnabled = process.env.EXPO_PUBLIC_GUSTARO_WINE_FEATURE_ENABLED !== "false";

export const profileFeatures = {
  allergenModuleEnabled: true,
  wineFeatureEnabled
};
