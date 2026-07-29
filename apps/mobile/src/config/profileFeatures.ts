const wineFeatureEnabled = process.env.EXPO_PUBLIC_GUSTARO_WINE_FEATURE_ENABLED !== "false";

// Bewusst fest deaktiviert (kein Env-Flag, kein Default-an): Praxistest im
// Restaurant (3 Tester, 28.07.2026) zeigte echte Fehlzuordnungen bei der
// Foto-Speisekartenerkennung - z.B. Gerichtname und Preis eines Gerichts
// vermischt mit der Beschreibung eines anderen ("Schweineleber" 15,90 EUR
// statt "Schweinelende" 20,50 EUR). askPickForMeImageUrlsAI.ts ist ein
// einzelner, ungeprueften Vision-Model-Call ohne nachgelagerte
// Attribution-/Faktenpruefung (anders als die Text-/PDF-Pipeline) - daher
// kein Prompt-Fix, sondern Eingang verstecken, bis eine
// Anzeigen-und-bestaetigen-Stufe vor der Analyse existiert.
const photoMenuFeatureEnabled = false;

export const profileFeatures = {
  allergenModuleEnabled: true,
  photoMenuFeatureEnabled,
  wineFeatureEnabled
};
