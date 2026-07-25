const wineFeatureEnabled = process.env.GUSTARO_WINE_FEATURE_ENABLED !== "false";

export const profileFeatures = {
  allergenModuleEnabled: true,
  wineFeatureEnabled
};
